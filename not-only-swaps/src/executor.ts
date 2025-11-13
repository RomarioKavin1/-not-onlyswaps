import { Contract, Wallet, keccak256, AbiCoder } from 'ethers';
import { Trade } from './model.js';
import { Network } from './network.js';
import { normalizeChainId, toRequestId } from './util.js';
import NodeCache from 'node-cache';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const ROUTER_ABI = [
  'function getSwapRequestParameters(bytes32 requestId) view returns (tuple(uint256 srcChainId, uint256 dstChainId, address sender, address recipient, address tokenIn, address tokenOut, uint256 amountOut, uint256 verificationFee, uint256 solverFee, uint256 nonce, bool executed, uint256 requestedAt))',
  'function relayTokens(address solver, bytes32 requestId, address sender, address recipient, address tokenIn, address tokenOut, uint256 amountOut, uint256 srcChainId, uint256 nonce) returns (bool)',
];

/**
 * Computes the requestId hash as the contract does in relayTokens
 * This matches: keccak256(abi.encode(sender, recipient, tokenIn, tokenOut, amountOut, srcChainId, dstChainId, nonce))
 */
function computeRequestId(
  sender: string,
  recipient: string,
  tokenIn: string,
  tokenOut: string,
  amountOut: bigint,
  srcChainId: bigint,
  dstChainId: bigint,
  nonce: bigint
): string {
  const abiCoder = AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [sender, recipient, tokenIn, tokenOut, amountOut, srcChainId, dstChainId, nonce]
  );
  return keccak256(encoded);
}

export class TradeExecutor {
  private ownAddress: string;
  private routers: Map<number, Contract>;
  private tokens: Map<number, Contract[]>;

  constructor(networks: Map<number, Network>) {
    this.routers = new Map();
    this.tokens = new Map();

    for (const [chainId, network] of networks) {
      this.routers.set(chainId, network.router);
      this.tokens.set(chainId, network.tokens);
    }

    // Get own address from first network
    const firstNetwork = networks.values().next().value;
    if (!firstNetwork) {
      throw new Error('No networks configured');
    }
    this.ownAddress = firstNetwork.ownAddress;
  }

  /**
   * Execute a list of trades
   */
  async execute(trades: Trade[], inFlight: NodeCache): Promise<void> {
    console.log(`🔄 Processing ${trades.length} trade(s)...`);
    for (const trade of trades) {
      // Skip if already in flight
      if (inFlight.has(trade.requestId)) {
        console.log(`⏭️  Skipping trade ${trade.requestId.slice(0, 16)}... - already in flight`);
        continue;
      }
      
      // Add to in-flight cache immediately
      inFlight.set(trade.requestId, true, 30); // 30 second TTL
      console.log(`🚀 Executing trade ${trade.requestId.slice(0, 16)}... (dest: ${trade.destChainId}, amount: ${trade.swapAmount})`);

      try {
        await this.executeTrade(trade);
        console.log(
          `Successfully traded: requestId=${trade.requestId}, ` +
          `amount=${trade.swapAmount}, ` +
          `srcChain=${trade.srcChainId}, ` +
          `destChain=${trade.destChainId}`
        );
      } catch (error: any) {
        // Log errors but remove from cache so it can be retried
        console.error(
          `Error executing trade ${trade.requestId.slice(0, 16)}...:`,
          error.message || error
        );
        // Remove from cache on error so it can be retried
        inFlight.del(trade.requestId);
      }
    }
  }

  /**
   * Execute a single trade
   */
  private async executeTrade(trade: Trade): Promise<void> {
    const destChainId = normalizeChainId(trade.destChainId);

    // Get router contract
    const router = this.routers.get(destChainId);
    if (!router) {
      throw new Error(`Router not found for chain ${destChainId}`);
    }

    // Format requestId as bytes32 using the same utility function used elsewhere
    const paddedRequestId = toRequestId(trade.requestId);

    // Try to get verified parameters from destination chain
    // The contract requires exact parameters that match what's stored during verification
    let actualTokenIn = trade.tokenInAddr.toLowerCase();
    let actualTokenOut = trade.tokenOutAddr.toLowerCase();
    let actualSender = trade.senderAddr.toLowerCase();
    let actualRecipient = trade.recipientAddr.toLowerCase();
    let actualAmountOut = trade.swapAmount;
    let actualSrcChainId = trade.srcChainId;
    let actualNonce = trade.nonce;

    try {
      // Query destination chain for verified parameters
      const storedParams = await router.getSwapRequestParameters(paddedRequestId);
      
      // Handle ethers.js v6 tuple return (can be object with named properties or array)
      let storedSrcChainId: bigint;
      let storedSender: string;
      let storedTokenIn: string;
      let storedTokenOut: string;
      let storedRecipient: string;
      let storedAmountOut: bigint;
      let storedNonce: bigint;
      
      if (typeof storedParams === 'object' && storedParams !== null && 'srcChainId' in storedParams) {
        // ethers.js v6 returns named properties
        const p = storedParams as any;
        storedSrcChainId = BigInt(p.srcChainId.toString());
        storedSender = (p.sender as string).toLowerCase();
        storedTokenIn = (p.tokenIn as string).toLowerCase();
        storedTokenOut = (p.tokenOut as string).toLowerCase();
        storedRecipient = (p.recipient as string).toLowerCase();
        storedAmountOut = BigInt(p.amountOut.toString());
        storedNonce = BigInt(p.nonce.toString());
      } else {
        // Fallback to array access (ethers.js v5 or tuple as array)
        // ABI order: [0]=srcChainId, [1]=dstChainId, [2]=sender, [3]=recipient, [4]=tokenIn, [5]=tokenOut, [6]=amountOut, [7]=verificationFee, [8]=solverFee, [9]=nonce, [10]=executed, [11]=requestedAt
        storedSrcChainId = BigInt(storedParams[0].toString());
        storedSender = (storedParams[2] as string).toLowerCase();
        storedTokenIn = (storedParams[4] as string).toLowerCase();
        storedTokenOut = (storedParams[5] as string).toLowerCase();
        storedRecipient = (storedParams[3] as string).toLowerCase();
        storedAmountOut = BigInt(storedParams[6].toString());
        storedNonce = BigInt(storedParams[9].toString());
      }
      
      // If verified (non-zero srcChainId and sender), use destination chain parameters
      if (storedSrcChainId !== BigInt(0) && storedSender !== '0x0000000000000000000000000000000000000000') {
        actualTokenIn = storedTokenIn;
        actualTokenOut = storedTokenOut;
        actualSender = storedSender;
        actualRecipient = storedRecipient;
        actualAmountOut = storedAmountOut;
        actualSrcChainId = storedSrcChainId;
        actualNonce = storedNonce;
        console.log(`📋 Using verified parameters from destination chain:`, {
          tokenIn: actualTokenIn,
          tokenOut: actualTokenOut,
          sender: actualSender,
          recipient: actualRecipient,
          amountOut: actualAmountOut.toString(),
          srcChainId: actualSrcChainId.toString(),
          nonce: actualNonce.toString(),
        });
      } else {
        console.log(`⚠️  Swap request not verified on destination chain (srcChainId=${storedSrcChainId.toString()}, sender=${storedSender}), using source chain parameters`);
      }
    } catch (error: any) {
      // If query fails, use source chain parameters
      console.log(`⚠️  Could not query destination chain: ${error.message}, using source chain parameters`);
    }

    // Get token contract
    const tokenContracts = this.tokens.get(destChainId);
    if (!tokenContracts) {
      throw new Error(`Tokens not found for chain ${destChainId}`);
    }

    const token = tokenContracts.find(
      (contract) => contract.target.toLowerCase() === actualTokenOut.toLowerCase()
    );

    if (!token) {
      throw new Error(`Token contract not found: ${actualTokenOut} (tried ${trade.tokenOutAddr})`);
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Trade execution timeout')), 10000)
    );

    const tradePromise = this.executeTradeInternal(
      trade,
      router,
      token,
      paddedRequestId,
      actualTokenIn,
      actualTokenOut,
      actualSender,
      actualRecipient,
      actualAmountOut,
      actualSrcChainId,
      actualNonce
    );
    
    await Promise.race([tradePromise, timeoutPromise]);
  }

  /**
   * Internal trade execution logic
   */
  private async executeTradeInternal(
    trade: Trade,
    router: Contract,
    token: Contract,
    paddedRequestId: string,
    actualTokenIn: string,
    actualTokenOut: string,
    actualSender: string,
    actualRecipient: string,
    actualAmountOut: bigint,
    actualSrcChainId: bigint,
    actualNonce: bigint
  ): Promise<void> {
    // Normalize all addresses to lowercase to ensure consistency
    const normalizedSolver = this.ownAddress.toLowerCase();
    const normalizedSender = actualSender.toLowerCase();
    const normalizedRecipient = actualRecipient.toLowerCase();
    const normalizedTokenIn = actualTokenIn.toLowerCase();
    const normalizedTokenOut = actualTokenOut.toLowerCase();

    // Step 1: Approve tokens
    try {
      const approveTx = await token.approve(router.target, actualAmountOut);
      console.log(`Approving tokens: ${approveTx.hash}`);
      
      // Wait for the transaction to be mined and confirmed
      // Wait for at least 1 confirmation to ensure it's included in a block
      const receipt = await approveTx.wait(1);
      
      if (!receipt) {
        throw new Error('Approval transaction failed');
      }
      
      if (receipt.status === 0) {
        throw new Error('Approval transaction reverted');
      }
      
      console.log(`Tokens approved: ${receipt.hash}`);
      
      // Small delay to ensure the approval is processed
      // This helps avoid race conditions where the contract hasn't updated its state yet
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      // Try to decode error messages
      if (error.reason) {
        throw new Error(`ERC20 approval error: ${error.reason}`);
      }
      throw new Error(`Error approving funds: ${error.message}`);
    }

    // Step 2: Relay tokens
    try {
      // Call relayTokens with verified parameters from destination chain
      const relayTx = await router.relayTokens(
        normalizedSolver,
        paddedRequestId,
        normalizedSender,
        normalizedRecipient,
        normalizedTokenIn,
        normalizedTokenOut,
        actualAmountOut,
        actualSrcChainId,
        actualNonce
      );

      console.log(`Relaying tokens: ${relayTx.hash}`);
      const receipt = await relayTx.wait();

      if (!receipt) {
        throw new Error('Relay transaction failed');
      }

      if (receipt.status === 0) {
        throw new Error('Relay transaction reverted');
      }

      console.log(`Tokens relayed successfully: ${receipt.hash}`);
    } catch (error: any) {
      // Try to decode custom errors
      if (error.data) {
        const errorData = error.data;
        // Check for SwapRequestParametersMismatch error (0xc4fec7e0)
        if (errorData === '0xc4fec7e0' || (typeof errorData === 'string' && errorData.startsWith('0xc4fec7e0'))) {
          throw new Error(`SwapRequestParametersMismatch: Parameters do not match stored swap request. Ensure the swap request is verified on the destination chain or parameters match exactly.`);
        }
      }
      
      // Let contract errors propagate - the contract will revert if swap request isn't verified
      if (error.reason) {
        throw new Error(`Router relay error: ${error.reason}`);
      }
      throw new Error(`Error submitting swap: ${error.message}`);
    }
  }
}

