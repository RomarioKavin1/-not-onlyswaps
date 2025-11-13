import { ChainState, Trade, Transfer } from './model.js';
import { ChainStateProvider } from './network.js';
import { normalizeChainId } from './util.js';
import NodeCache from 'node-cache';

export class Solver {
  private states: Map<number, ChainState>;
  private chains: Map<number, ChainStateProvider>;

  constructor(chains: Map<number, ChainStateProvider>) {
    this.chains = chains;
    this.states = new Map();
  }

  /**
   * Initialize solver by fetching initial state for all chains
   */
  static async from(
    chains: Map<number, ChainStateProvider>
  ): Promise<Solver> {
    const solver = new Solver(chains);
    
    // Fetch initial state for each chain
    for (const [chainId, chain] of chains) {
      const state = await chain.fetchState();
      solver.states.set(chainId, state);
    }

    return solver;
  }

  /**
   * Fetch updated state for a chain and calculate executable trades
   */
  async fetchState(
    chainId: number,
    inFlight: NodeCache
  ): Promise<Trade[]> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Fetch updated state
    const updatedState = await chain.fetchState();
    this.states.set(chainId, updatedState);

    // Calculate trades
    return this.calculateTrades(chainId, inFlight);
  }

  /**
   * Calculate executable trades for a given chain
   */
  private calculateTrades(
    chainId: number,
    inFlight: NodeCache
  ): Trade[] {
    const trades: Trade[] = [];
    const states = new Map(this.states); // Clone states for mutation
    
    const chainState = states.get(chainId);
    if (!chainState) {
      throw new Error(`State for chain ${chainId} not found`);
    }

    const transfers = chainState.transfers;
    
    // Filter out already fulfilled transfers before processing
    const unfulfilledTransfers = transfers.filter((transfer) => {
      const destChainId = normalizeChainId(transfer.params.dstChainId);
      const destState = states.get(destChainId);
      if (!destState) return true; // Keep if we can't check
      
      const normalizedRequestId = transfer.requestId.toLowerCase();
      const isFulfilled = destState.alreadyFulfilled.some(
        (id) => id.toLowerCase() === normalizedRequestId
      );
      return !isFulfilled; // Keep only unfulfilled transfers
    });

    if (transfers.length > 0) {
      const fulfilledCount = transfers.length - unfulfilledTransfers.length;
      if (fulfilledCount > 0) {
        console.log(`   Chain ${chainId}: Evaluating ${unfulfilledTransfers.length} transfer(s) (${fulfilledCount} already fulfilled, filtered out)`);
      } else {
        console.log(`   Chain ${chainId}: Evaluating ${unfulfilledTransfers.length} transfer(s)`);
      }
    }

    for (const transfer of unfulfilledTransfers) {
      // Skip if already in flight
      if (inFlight.has(transfer.requestId)) {
        continue;
      }

      // Log transfer details for debugging
      const destChainId = normalizeChainId(transfer.params.dstChainId);
      const destState = states.get(destChainId);
      const tokenAddress = transfer.params.tokenOut.toLowerCase();
      const tokenBalance = destState?.tokenBalances.get(tokenAddress);
      
      console.log(`   📋 Transfer ${transfer.requestId.slice(0, 16)}...: src=${normalizeChainId(transfer.params.srcChainId)}, dst=${destChainId}, amountOut=${transfer.params.amountOut}, fee=${transfer.params.solverFee}, executed=${transfer.params.executed}, destBalance=${tokenBalance || 'N/A'}`);
      
      const trade = this.solve(transfer, states);
      if (trade) {
        console.log(`   ✅ Found executable trade: ${transfer.requestId.slice(0, 16)}... (dest: ${destChainId}, amount: ${transfer.params.amountOut})`);
        trades.push(trade);
      }
    }

    return trades;
  }

  /**
   * Solve a single transfer request
   */
  private solve(
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Trade | null {
    const {
      dstChainId,
      amountOut,
      solverFee,
      executed,
    } = transfer.params;

    const destChainId = normalizeChainId(dstChainId);
    const destState = states.get(destChainId);

    if (!destState) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - destination chain ${destChainId} not found in states (available: ${Array.from(states.keys()).join(', ')})`);
      return null;
    }

    // Skip if already executed
    if (executed) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - already executed`);
      return null;
    }

    // Skip if already fulfilled
    // Normalize request ID for comparison
    const normalizedRequestId = transfer.requestId.toLowerCase();
    const isFulfilled = destState.alreadyFulfilled.some(
      (id) => id.toLowerCase() === normalizedRequestId
    );
    if (isFulfilled) {
      // Don't log - already filtered out before this point
      return null;
    }

    // Check native balance
    if (destState.nativeBalance === BigInt(0)) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - native balance too low (${destState.nativeBalance})`);
      return null;
    }

    // Check token balance
    const tokenAddress = transfer.params.tokenOut.toLowerCase();
    const tokenBalance = destState.tokenBalances.get(tokenAddress);

    if (tokenBalance === undefined) {
      const availableTokens = Array.from(destState.tokenBalances.keys());
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - token not found in balances for ${tokenAddress} (available tokens: ${availableTokens.length > 0 ? availableTokens.join(', ') : 'none'})`);
      return null;
    }

    if (tokenBalance === BigInt(0) || tokenBalance < amountOut) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - token balance too low (have: ${tokenBalance}, need: ${amountOut})`);
      return null;
    }

    // Check solver fee
    if (solverFee < BigInt(1)) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - fee too low (${solverFee})`);
      return null;
    }

    // Commit tokens to this trade (prevent double-spending)
    destState.tokenBalances.set(tokenAddress, tokenBalance - amountOut);

    // Convert transfer to trade
    // Normalize all addresses to lowercase for consistency
    return {
      requestId: transfer.requestId,
      nonce: transfer.params.nonce,
      tokenInAddr: transfer.params.tokenIn.toLowerCase(),
      tokenOutAddr: transfer.params.tokenOut.toLowerCase(),
      srcChainId: transfer.params.srcChainId,
      destChainId: transfer.params.dstChainId,
      senderAddr: transfer.params.sender.toLowerCase(),
      recipientAddr: transfer.params.recipient.toLowerCase(),
      swapAmount: transfer.params.amountOut,
    };
  }
}

