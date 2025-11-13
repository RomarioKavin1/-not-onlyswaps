import {
  JsonRpcProvider,
  WebSocketProvider,
  Contract,
  Wallet,
  formatUnits,
} from 'ethers';
import { ChainState, Transfer, SwapRequestParameters } from './model.js';
import { NetworkConfig } from './config.js';
import { toRequestId } from './util.js';

// ERC20 ABI - minimal interface for balanceOf and faucet
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function faucet() returns (bool)', // ERC20FaucetToken faucet function
];

// Router contract ABI - based on the Rust implementation
const ROUTER_ABI = [
  'function getFulfilledTransfers() view returns (bytes32[])',
  'function getUnfulfilledSolverRefunds() view returns (bytes32[])',
  'function getSwapRequestParameters(bytes32 requestId) view returns (tuple(uint256 srcChainId, uint256 dstChainId, address sender, address recipient, address tokenIn, address tokenOut, uint256 amountOut, uint256 verificationFee, uint256 solverFee, uint256 nonce, bool executed, uint256 requestedAt))',
  'function relayTokens(address solver, bytes32 requestId, address sender, address recipient, address tokenIn, address tokenOut, uint256 amountOut, uint256 srcChainId, uint256 nonce) returns (bool)',
];

export interface ChainStateProvider {
  fetchState(): Promise<ChainState>;
}

export class Network implements ChainStateProvider {
  public readonly chainId: number;
  public readonly provider: WebSocketProvider;
  public readonly ownAddress: string;
  public readonly router: Contract;
  public readonly tokens: Contract[];

  private wallet: Wallet;

  constructor(
    chainId: number,
    rpcUrl: string,
    privateKey: string,
    routerAddress: string,
    tokenAddresses: string[]
  ) {
    this.chainId = chainId;
    this.provider = new WebSocketProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
    this.ownAddress = this.wallet.address;

    // Create router contract instance (connected to wallet for sending transactions)
    this.router = new Contract(routerAddress, ROUTER_ABI, this.wallet);

    // Create token contract instances (connected to wallet for sending transactions)
    this.tokens = tokenAddresses.map(
      (addr) => new Contract(addr, ERC20_ABI, this.wallet)
    );
  }

  /**
   * Subscribe to new block events using WebSocket provider events with polling fallback
   */
  async *subscribeBlocks(): AsyncGenerator<{ chainId: number; blockNumber: number }> {
    // Use a queue to buffer block events
    const blockQueue: number[] = [];
    let resolver: ((value: number) => void) | null = null;
    let lastBlockNumber: number | null = null;
    let blockEventReceived = false;

    // Set up event listener for new blocks
    const blockHandler = (blockNumber: number) => {
      blockEventReceived = true;
      if (lastBlockNumber === null) {
        lastBlockNumber = blockNumber - 1;
      }
      
      // Add all blocks from last to current
      for (let i = lastBlockNumber + 1; i <= blockNumber; i++) {
        blockQueue.push(i);
        if (resolver) {
          const nextBlock = blockQueue.shift()!;
          resolver(nextBlock);
          resolver = null;
        }
      }
      lastBlockNumber = blockNumber;
    };

    // Subscribe to block events
    this.provider.on('block', blockHandler);

    // Initialize last block number
    try {
      lastBlockNumber = await this.provider.getBlockNumber();
      console.log(`🔗 Chain ${this.chainId}: Connected at block ${lastBlockNumber}`);
    } catch (error) {
      console.error(`Error getting initial block number for chain ${this.chainId}:`, error);
      throw error;
    }

    // Polling fallback: poll every 2 seconds if WebSocket events aren't working
    const pollInterval = setInterval(async () => {
      if (lastBlockNumber !== null) {
        try {
          const currentBlock = await this.provider.getBlockNumber();
          if (currentBlock > lastBlockNumber) {
            // Trigger block handler for missed blocks
            blockHandler(currentBlock);
          }
        } catch (error) {
          console.error(`Error polling blocks for chain ${this.chainId}:`, error);
        }
      }
    }, 2000); // Poll every 2 seconds

    // Yield blocks as they arrive
    try {
      while (true) {
        if (blockQueue.length > 0) {
          const blockNumber = blockQueue.shift()!;
          yield { chainId: this.chainId, blockNumber };
        } else {
          // Wait for next block (either from event or polling)
          const blockNumber = await new Promise<number>((resolve) => {
            resolver = resolve;
          });
          yield { chainId: this.chainId, blockNumber };
        }
      }
    } finally {
      clearInterval(pollInterval);
    }
  }

  /**
   * Fetch the current state of the chain
   */
  async fetchState(): Promise<ChainState> {
    // Fetch token balances
    const tokenBalances = new Map<string, bigint>();
    const balancePromises = this.tokens.map(async (token) => {
      try {
        const balance = await token.balanceOf(this.ownAddress);
        const address = (token.target as string).toLowerCase();
        return { address, balance: BigInt(balance.toString()) };
      } catch (error) {
        console.error(`Error fetching balance for token ${token.target}:`, error);
        return null;
      }
    });

    const balances = await Promise.all(balancePromises);
    for (const balance of balances) {
      if (balance) {
        tokenBalances.set(balance.address.toLowerCase(), balance.balance);
        console.log(`   Chain ${this.chainId}: Token ${balance.address} balance: ${balance.balance}`);
      }
    }
    
    if (tokenBalances.size === 0) {
      console.log(`   Chain ${this.chainId}: No token balances found (configured tokens: ${this.tokens.length})`);
    }

    // Fetch native balance
    const nativeBalance = await this.provider.getBalance(this.ownAddress);

    // Fetch already fulfilled transfers
    let alreadyFulfilled: string[] = [];
    try {
      const fulfilled = await this.router.getFulfilledTransfers();
      alreadyFulfilled = fulfilled.map((id: string) => {
        // Handle both hex strings and bytes32 formats
        if (typeof id === 'string') {
          return toRequestId(id);
        }
        // If it's a bytes32 array or other format, convert it
        return toRequestId(id);
      });
      if (alreadyFulfilled.length > 0) {
        console.log(`   Chain ${this.chainId}: Found ${alreadyFulfilled.length} fulfilled transfer(s)`);
      }
    } catch (error) {
      console.error(`Error fetching fulfilled transfers:`, error);
    }

    // Fetch unfulfilled transfers
    // Note: getUnfulfilledSolverRefunds() returns transfers that are unfulfilled from the solver's
    // refund perspective, but they might already be fulfilled on the destination chain.
    // We'll filter those out in the solver logic.
    let transfers: Transfer[] = [];
    try {
      const unfulfilled = await this.router.getUnfulfilledSolverRefunds();
      if (unfulfilled.length > 0) {
        console.log(`   Chain ${this.chainId}: Found ${unfulfilled.length} unfulfilled solver refund(s) from source chain`);
      }
      
      const transferPromises = unfulfilled.map(async (requestId: any) => {
        try {
          // Convert requestId to proper format (bytes32 hex string)
          const requestIdHex = typeof requestId === 'string' 
            ? toRequestId(requestId)
            : toRequestId(requestId);
          
          const params = await this.router.getSwapRequestParameters(requestIdHex);
          
          // Try accessing by property name first (ethers.js v6 might support this)
          let srcChainId: bigint;
          let dstChainId: bigint;
          let tokenIn: string;
          let tokenOut: string;
          let amountOut: bigint;
          let sender: string | undefined;
          let recipient: string | undefined;
          let nonce: bigint | undefined;
          
          if (typeof params === 'object' && params !== null && 'srcChainId' in params) {
            // ethers.js v6 might return named properties
            const p = params as any;
            srcChainId = BigInt(p.srcChainId.toString());
            dstChainId = BigInt(p.dstChainId.toString());
            sender = (p.sender as string).toLowerCase();
            recipient = (p.recipient as string).toLowerCase();
            tokenIn = p.tokenIn.toLowerCase();
            tokenOut = p.tokenOut.toLowerCase();
            amountOut = BigInt(p.amountOut.toString());
            nonce = BigInt(p.nonce.toString());
          } else {
            // Fallback to array access
            // Based on ABI order: [0]=srcChainId, [1]=dstChainId, [2]=sender, [3]=recipient, [4]=tokenIn, [5]=tokenOut, [6]=amountOut, ...
            // But actual data shows different positions, so try both approaches
            
            // Try ABI order first
            // According to ABI: [0]=sender, [1]=recipient, [2]=tokenIn, [3]=tokenOut, [4]=amountOut, [5]=srcChainId, [6]=dstChainId, [7]=verificationFee, [8]=solverFee, [9]=nonce, [10]=executed, [11]=requestedAt
            try {
              // Extract sender and recipient - ethers.js returns addresses as bigints
              // According to ABI: [0]=sender, [1]=recipient
              let senderValue = params[0];
              let recipientValue = params[1];
              
              // Convert bigint addresses to hex addresses (last 20 bytes = 40 hex chars)
              // ethers.js returns addresses as bigints when they're part of a tuple
              if (typeof senderValue === 'bigint' || typeof senderValue === 'number') {
                const senderHex = '0x' + BigInt(senderValue).toString(16).padStart(64, '0').slice(-40);
                sender = senderHex.toLowerCase();
              } else if (typeof senderValue === 'string') {
                sender = senderValue.toLowerCase();
              } else {
                throw new Error(`Unexpected sender type: ${typeof senderValue}`);
              }
              
              if (typeof recipientValue === 'bigint' || typeof recipientValue === 'number') {
                const recipientHex = '0x' + BigInt(recipientValue).toString(16).padStart(64, '0').slice(-40);
                recipient = recipientHex.toLowerCase();
              } else if (typeof recipientValue === 'string') {
                recipient = recipientValue.toLowerCase();
              } else {
                throw new Error(`Unexpected recipient type: ${typeof recipientValue}`);
              }
              
              // Extract other fields according to ABI order: [2]=tokenIn, [3]=tokenOut, [4]=amountOut, [5]=srcChainId, [6]=dstChainId, [9]=nonce
              tokenIn = (params[2] as string).toLowerCase();
              tokenOut = (params[3] as string).toLowerCase();
              
              // amountOut might be hex encoded string or bigint
              let amountOutValue = params[4];
              if (typeof amountOutValue === 'string' && amountOutValue.startsWith('0x')) {
                // Decode hex-encoded amountOut (e.g., '0x0000000000000000000D2F13f7789F0000' = 950000000000000000)
                amountOut = BigInt(amountOutValue);
              } else {
                amountOut = BigInt(amountOutValue.toString());
              }
              
              // srcChainId might be hex encoded string or bigint
              let srcChainIdValue = params[5];
              if (typeof srcChainIdValue === 'string' && srcChainIdValue.startsWith('0x')) {
                // Decode hex-encoded srcChainId (e.g., '0x0000000000000000000000000000000000007A69' = 31337)
                // Extract the last 20 bytes (40 hex chars) and convert to number
                const hexStr = srcChainIdValue.slice(-40); // Get last 40 chars
                srcChainId = BigInt('0x' + hexStr);
              } else {
                srcChainId = BigInt(srcChainIdValue.toString());
              }
              
              dstChainId = BigInt(params[6].toString());
              nonce = BigInt(params[9].toString());
              
              // Validate: if chain IDs are reasonable (< 2^64), use this order
              if (srcChainId < BigInt('18446744073709551616') && dstChainId < BigInt('18446744073709551616')) {
              } else {
                throw new Error('Chain IDs too large, trying alternative parsing');
              }
            } catch {
              // Fallback to observed data structure
              // [5] = srcChainId hex (0x7A69 = 31337)
              // [6] = dstChainId (31338)
              // [4] = amountOut hex (0x0D2F13f7789F0000 = 950000000000000000)
              srcChainId = BigInt(params[5] as string);
              dstChainId = BigInt(params[6].toString());
              amountOut = BigInt(params[4] as string);
              
              // Token addresses are not in the contract response in the expected positions
              // Use the configured token address for the destination chain
              // Since we're fetching from the source chain but need the token on the destination chain,
              // we need to get the token address from the destination chain's network config
              // For now, use the configured token from this network (which should be the same token)
              const configuredToken = this.tokens[0]?.target as string;
              if (!configuredToken) {
                throw new Error(`No token configured for chain ${this.chainId}`);
              }
              tokenIn = configuredToken.toLowerCase();
              tokenOut = configuredToken.toLowerCase();
            }
          }
          
          const swapParams: SwapRequestParameters = {
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            sender: sender || (params[2] as string),
            recipient: recipient || (params[3] as string),
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountOut: amountOut,
            verificationFee: BigInt(params[7].toString()),
            solverFee: BigInt(params[8].toString()),
            nonce: nonce || BigInt(params[9].toString()),
            executed: params[10] as boolean,
            requestedAt: BigInt(params[11].toString()),
          };
          
          return {
            requestId: requestIdHex,
            params: swapParams,
          } as Transfer;
        } catch (error) {
          console.error(`Error fetching swap request parameters for ${requestId}:`, error);
          return null;
        }
      });

      const transferResults = await Promise.all(transferPromises);
      transfers = transferResults.filter((t): t is Transfer => t !== null);
    } catch (error) {
      console.error(`Error fetching unfulfilled transfers:`, error);
    }

    return {
      nativeBalance,
      tokenBalances,
      transfers,
      alreadyFulfilled,
    };
  }

  /**
   * Close the WebSocket connection
   */
  async destroy(): Promise<void> {
    await this.provider.destroy();
  }

  /**
   * Create multiple Network instances from configs
   */
  static async createMany(
    privateKey: string,
    networkConfigs: NetworkConfig[]
  ): Promise<Map<number, Network>> {
    const networks = new Map<number, Network>();

    for (const config of networkConfigs) {
      const network = new Network(
        config.chain_id,
        config.rpc_url,
        privateKey,
        config.router_address,
        config.tokens
      );
      networks.set(config.chain_id, network);
    }

    console.log(`Configured ${networkConfigs.length} chain(s)`);
    return networks;
  }
}

