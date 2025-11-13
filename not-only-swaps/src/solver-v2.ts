import { ChainState, Trade, Transfer, Condition, ConditionalTransfer } from './model.js';
import { ChainStateProvider } from './network.js';
import { normalizeChainId } from './util.js';
import NodeCache from 'node-cache';

// ============================================================================
// CONDITION EVALUATOR
// ============================================================================

/**
 * Evaluates conditions for conditional execution
 */
export class ConditionEvaluator {
  private priceOracle: PriceOracle;
  private chainProviders: Map<number, ChainStateProvider>;

  constructor(
    priceOracle: PriceOracle,
    chainProviders: Map<number, ChainStateProvider>
  ) {
    this.priceOracle = priceOracle;
    this.chainProviders = chainProviders;
  }

  /**
   * Evaluate all conditions for a transfer
   */
  async evaluateConditions(
    conditions: Condition[],
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<boolean> {
    if (!conditions || conditions.length === 0) {
      return true; // No conditions = always execute
    }

    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, transfer, states);
      if (!result) {
        console.log(`   ⏸️  Condition not met for ${transfer.requestId.slice(0, 16)}...: ${condition.type} ${condition.operator}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: Condition,
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<boolean> {
    switch (condition.type) {
      case 'price':
        return await this.evaluatePriceCondition(condition, transfer);
      
      case 'time':
        return this.evaluateTimeCondition(condition);
      
      case 'balance':
        return await this.evaluateBalanceCondition(condition, states);
      
      case 'custom':
        return await this.evaluateCustomCondition(condition, transfer, states);
      
      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  /**
   * Evaluate price condition (e.g., only execute if price >= X)
   */
  private async evaluatePriceCondition(
    condition: Condition,
    transfer: Transfer
  ): Promise<boolean> {
    const tokenPair = condition.params.tokenPair || `${transfer.params.tokenIn}/${transfer.params.tokenOut}`;
    const chainId = condition.params.chainId || Number(transfer.params.dstChainId);
    const targetPrice = condition.params.value;
    const maxPrice = condition.params.max;

    try {
      const currentPrice = await this.priceOracle.getPrice(tokenPair, chainId);
      return this.compare(currentPrice, condition.operator, targetPrice, maxPrice);
    } catch (error) {
      console.warn(`Failed to fetch price for ${tokenPair}:`, error);
      return false; // Fail safe: don't execute if we can't verify price
    }
  }

  /**
   * Evaluate time condition (e.g., only execute after timestamp X)
   */
  private evaluateTimeCondition(condition: Condition): boolean {
    const now = Date.now();
    const targetTime = condition.params.timestamp;
    const maxTime = condition.params.max;

    return this.compare(now, condition.operator, targetTime, maxTime);
  }

  /**
   * Evaluate balance condition (e.g., only execute if balance >= X)
   */
  private async evaluateBalanceCondition(
    condition: Condition,
    states: Map<number, ChainState>
  ): Promise<boolean> {
    const chainId = condition.params.chainId;
    const tokenAddress = condition.params.token?.toLowerCase();
    const minAmount = BigInt(condition.params.minAmount || 0);
    const maxAmount = condition.params.maxAmount ? BigInt(condition.params.maxAmount) : undefined;

    const state = states.get(chainId);
    if (!state) {
      return false;
    }

    if (tokenAddress) {
      const balance = state.tokenBalances.get(tokenAddress) || BigInt(0);
      return this.compare(balance, condition.operator, minAmount, maxAmount);
    } else {
      // Check native balance
      return this.compare(state.nativeBalance, condition.operator, minAmount, maxAmount);
    }
  }

  /**
   * Evaluate custom condition (JavaScript function)
   */
  private async evaluateCustomCondition(
    condition: Condition,
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<boolean> {
    if (typeof condition.params.evaluator === 'function') {
      try {
        return await condition.params.evaluator(transfer, states);
      } catch (error) {
        console.error(`Custom condition evaluator failed:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * Compare two values based on operator
   */
  private compare(
    value: number | bigint,
    operator: string,
    target: number | bigint,
    maxValue?: number | bigint
  ): boolean {
    const v = typeof value === 'bigint' ? Number(value) : value;
    const t = typeof target === 'bigint' ? Number(target) : target;
    const max = maxValue !== undefined ? (typeof maxValue === 'bigint' ? Number(maxValue) : maxValue) : t;

    switch (operator) {
      case 'gt':
        return v > t;
      case 'lt':
        return v < t;
      case 'eq':
        return v === t;
      case 'gte':
        return v >= t;
      case 'lte':
        return v <= t;
      case 'between':
        return v >= t && v <= max;
      default:
        return false;
    }
  }
}

// ============================================================================
// RISK MANAGER
// ============================================================================

/**
 * Assesses and manages risk for trades
 */
export class RiskManager {
  maxRisk: number = 0.3; // 30% max risk threshold
  minSolverFee: bigint = BigInt(1000000000000000); // 0.001 ETH minimum fee

  /**
   * Assess overall risk of a trade
   */
  async assessRisk(trade: Trade, transfer: Transfer, states: Map<number, ChainState>): Promise<number> {
    const risks = [
      this.assessLiquidityRisk(trade, states),
      this.assessFeeRisk(transfer),
      this.assessExecutionRisk(trade, states),
      this.assessCounterpartyRisk(transfer),
    ];

    // Weighted average of risks
    return risks.reduce((sum, risk) => sum + risk, 0) / risks.length;
  }

  /**
   * Assess liquidity risk (can we actually execute this?)
   */
  private assessLiquidityRisk(trade: Trade, states: Map<number, ChainState>): number {
    const destChainId = normalizeChainId(trade.destChainId);
    const destState = states.get(destChainId);
    
    if (!destState) {
      return 1.0; // High risk if chain state unknown
    }

    const tokenBalance = destState.tokenBalances.get(trade.tokenOutAddr) || BigInt(0);
    const requiredAmount = trade.swapAmount;

    if (tokenBalance === BigInt(0)) {
      return 1.0; // No liquidity = high risk
    }

    if (tokenBalance < requiredAmount) {
      return 0.8; // Insufficient liquidity = high risk
    }

    // Calculate liquidity ratio
    const liquidityRatio = Number(tokenBalance) / Number(requiredAmount);
    if (liquidityRatio < 1.1) {
      return 0.5; // Low buffer = medium risk
    }

    return 0.1; // Good liquidity = low risk
  }

  /**
   * Assess fee risk (is the fee worth it?)
   */
  private assessFeeRisk(transfer: Transfer): number {
    if (transfer.params.solverFee < this.minSolverFee) {
      return 0.9; // Fee too low = high risk (not profitable)
    }

    // Fee is reasonable
    return 0.1;
  }

  /**
   * Assess execution risk (gas, network conditions, etc.)
   */
  private assessExecutionRisk(trade: Trade, states: Map<number, ChainState>): number {
    const destChainId = normalizeChainId(trade.destChainId);
    const destState = states.get(destChainId);
    
    if (!destState) {
      return 0.8;
    }

    // Check native balance for gas
    if (destState.nativeBalance === BigInt(0)) {
      return 1.0; // No gas = can't execute
    }

    // Low native balance = higher risk
    const minGas = BigInt(100000000000000000); // 0.1 ETH minimum
    if (destState.nativeBalance < minGas) {
      return 0.6; // Low gas = medium-high risk
    }

    return 0.2; // Good gas balance = low risk
  }

  /**
   * Assess counterparty risk (sender/recipient)
   */
  private assessCounterpartyRisk(transfer: Transfer): number {
    // Basic checks - could be enhanced with reputation system
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    
    if (transfer.params.sender.toLowerCase() === zeroAddress ||
        transfer.params.recipient.toLowerCase() === zeroAddress) {
      return 0.5; // Zero address = medium risk
    }

    return 0.1; // Normal addresses = low risk
  }

  /**
   * Check if trade should be executed based on risk
   */
  async shouldExecute(trade: Trade, transfer: Transfer, states: Map<number, ChainState>): Promise<boolean> {
    const risk = await this.assessRisk(trade, transfer, states);
    return risk < this.maxRisk;
  }
}

// ============================================================================
// PROFIT OPTIMIZER
// ============================================================================

/**
 * Optimizes profit calculations and trade selection
 */
export class ProfitOptimizer {
  private gasPriceEstimator: GasPriceEstimator;

  constructor(gasPriceEstimator: GasPriceEstimator) {
    this.gasPriceEstimator = gasPriceEstimator;
  }

  /**
   * Estimate net profit for a trade
   */
  async estimateProfit(
    trade: Trade,
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<bigint> {
    const solverFee = transfer.params.solverFee;
    const gasCost = await this.estimateGasCost(trade, states);
    const opportunityCost = await this.estimateOpportunityCost(trade, states);

    // Net profit = fee - gas - opportunity cost
    const profit = solverFee - gasCost - opportunityCost;
    
    return profit > BigInt(0) ? profit : BigInt(0);
  }

  /**
   * Estimate gas cost for executing the trade
   */
  private async estimateGasCost(
    trade: Trade,
    states: Map<number, ChainState>
  ): Promise<bigint> {
    const destChainId = normalizeChainId(trade.destChainId);
    
    // Estimate gas units needed (approval + relay)
    const estimatedGasUnits = BigInt(150000); // Approximate gas for approval + relay
    
    // Get gas price for the chain
    const gasPrice = await this.gasPriceEstimator.getGasPrice(destChainId);
    
    return estimatedGasUnits * gasPrice;
  }

  /**
   * Estimate opportunity cost (what we could make elsewhere)
   */
  private async estimateOpportunityCost(
    trade: Trade,
    states: Map<number, ChainState>
  ): Promise<bigint> {
    // Simplified: opportunity cost is the value of locked capital
    // Could be enhanced with actual alternative trade opportunities
    const lockedAmount = trade.swapAmount;
    const lockTime = BigInt(60); // seconds (estimated execution time)
    
    // Very simplified: assume 0.1% per hour opportunity cost
    const hourlyRate = BigInt(1000); // 0.1% = 1000 basis points per hour
    const cost = (lockedAmount * hourlyRate * lockTime) / BigInt(3600000);
    
    return cost;
  }

  /**
   * Calculate profit score (normalized for comparison)
   */
  async calculateProfitScore(
    trade: Trade,
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<number> {
    const profit = await this.estimateProfit(trade, transfer, states);
    const solverFee = transfer.params.solverFee;
    
    if (solverFee === BigInt(0)) {
      return 0;
    }

    // Profit margin as percentage
    return Number(profit) / Number(solverFee);
  }
}

// ============================================================================
// PRICE ORACLE
// ============================================================================

/**
 * Fetches token prices from various sources
 */
export class PriceOracle {
  private cache: Map<string, { price: number; timestamp: number }> = new Map();
  private cacheTTL: number = 60000; // 1 minute cache

  /**
   * Get price for a token pair
   */
  async getPrice(tokenPair: string, chainId: number): Promise<number> {
    const cacheKey = `${tokenPair}-${chainId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }

    // Try to fetch from multiple sources
    let price: number | null = null;

    // Source 1: Try Coingecko API (if available)
    try {
      price = await this.fetchFromCoingecko(tokenPair, chainId);
    } catch (error) {
      // Fallback to other sources
    }

    // Source 2: Try Chainlink (if available)
    if (price === null) {
      try {
        price = await this.fetchFromChainlink(tokenPair, chainId);
      } catch (error) {
        // Continue to fallback
      }
    }

    // Fallback: Use 1:1 ratio if same token, or estimate based on chain
    if (price === null) {
      price = this.estimatePrice(tokenPair, chainId);
    }

    this.cache.set(cacheKey, { price, timestamp: Date.now() });
    return price;
  }

  private async fetchFromCoingecko(tokenPair: string, chainId: number): Promise<number> {
    // Placeholder - implement actual Coingecko API call
    // For now, return null to use fallback
    return null as any;
  }

  private async fetchFromChainlink(tokenPair: string, chainId: number): Promise<number> {
    // Placeholder - implement actual Chainlink price feed
    // For now, return null to use fallback
    return null as any;
  }

  private estimatePrice(tokenPair: string, chainId: number): number {
    // Fallback: if same token on both sides, assume 1:1
    const [tokenIn, tokenOut] = tokenPair.split('/');
    if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) {
      return 1.0;
    }

    // Default fallback: assume 1.0 (could be enhanced with historical data)
    return 1.0;
  }
}

// ============================================================================
// GAS PRICE ESTIMATOR
// ============================================================================

/**
 * Estimates gas prices for different chains
 */
export class GasPriceEstimator {
  private cache: Map<number, { gasPrice: bigint; timestamp: number }> = new Map();
  private cacheTTL: number = 30000; // 30 second cache

  /**
   * Get current gas price for a chain
   */
  async getGasPrice(chainId: number): Promise<bigint> {
    const cached = this.cache.get(chainId);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.gasPrice;
    }

    // Default gas prices (in wei)
    const defaultGasPrices: Record<number, bigint> = {
      1: BigInt(20000000000), // Ethereum: 20 gwei
      137: BigInt(30000000000), // Polygon: 30 gwei
      42161: BigInt(100000000), // Arbitrum: 0.1 gwei
      10: BigInt(1000000), // Optimism: 0.001 gwei
    };

    const gasPrice = defaultGasPrices[chainId] || BigInt(20000000000); // Default: 20 gwei
    this.cache.set(chainId, { gasPrice, timestamp: Date.now() });

    return gasPrice;
  }
}

// ============================================================================
// INTELLIGENT SOLVER V2
// ============================================================================

/**
 * Enhanced solver with conditional execution and intelligent optimization
 */
export class SolverV2 {
  private states: Map<number, ChainState>;
  private chains: Map<number, ChainStateProvider>;
  private conditionEvaluator: ConditionEvaluator;
  private riskManager: RiskManager;
  private profitOptimizer: ProfitOptimizer;
  private priceOracle: PriceOracle;
  private gasPriceEstimator: GasPriceEstimator;

  constructor(chains: Map<number, ChainStateProvider>) {
    this.chains = chains;
    this.states = new Map();
    
    // Initialize supporting services
    this.priceOracle = new PriceOracle();
    this.gasPriceEstimator = new GasPriceEstimator();
    this.conditionEvaluator = new ConditionEvaluator(this.priceOracle, chains);
    this.riskManager = new RiskManager();
    this.profitOptimizer = new ProfitOptimizer(this.gasPriceEstimator);
  }

  /**
   * Initialize solver by fetching initial state for all chains
   */
  static async from(
    chains: Map<number, ChainStateProvider>
  ): Promise<SolverV2> {
    const solver = new SolverV2(chains);
    
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

    // Calculate trades with intelligent optimization
    return this.calculateTrades(chainId, inFlight);
  }

  /**
   * Calculate executable trades for a given chain with intelligent optimization
   */
  private async calculateTrades(
    chainId: number,
    inFlight: NodeCache
  ): Promise<Trade[]> {
    const states = new Map(this.states); // Clone states for mutation
    
    const chainState = states.get(chainId);
    if (!chainState) {
      throw new Error(`State for chain ${chainId} not found`);
    }

    const transfers = chainState.transfers;
    
    // Filter out already fulfilled transfers
    const unfulfilledTransfers = transfers.filter((transfer) => {
      const destChainId = normalizeChainId(transfer.params.dstChainId);
      const destState = states.get(destChainId);
      if (!destState) return true;
      
      const normalizedRequestId = transfer.requestId.toLowerCase();
      const isFulfilled = destState.alreadyFulfilled.some(
        (id) => id.toLowerCase() === normalizedRequestId
      );
      return !isFulfilled;
    });

    if (transfers.length > 0) {
      const fulfilledCount = transfers.length - unfulfilledTransfers.length;
      if (fulfilledCount > 0) {
        console.log(`   Chain ${chainId}: Evaluating ${unfulfilledTransfers.length} transfer(s) (${fulfilledCount} already fulfilled, filtered out)`);
      } else {
        console.log(`   Chain ${chainId}: Evaluating ${unfulfilledTransfers.length} transfer(s)`);
      }
    }

    // Collect all potential trades
    const potentialTrades: Array<{ trade: Trade; transfer: Transfer; score: number; risk: number }> = [];

    for (const transfer of unfulfilledTransfers) {
      // Skip if already in flight
      if (inFlight.has(transfer.requestId)) {
        continue;
      }

      // Log transfer details
      const destChainId = normalizeChainId(transfer.params.dstChainId);
      const destState = states.get(destChainId);
      const tokenAddress = transfer.params.tokenOut.toLowerCase();
      const tokenBalance = destState?.tokenBalances.get(tokenAddress);
      
      console.log(`   📋 Transfer ${transfer.requestId.slice(0, 16)}...: src=${normalizeChainId(transfer.params.srcChainId)}, dst=${destChainId}, amountOut=${transfer.params.amountOut}, fee=${transfer.params.solverFee}, executed=${transfer.params.executed}, destBalance=${tokenBalance || 'N/A'}`);

      // Evaluate conditions first
      if (transfer.conditions && transfer.conditions.length > 0) {
        const conditionsMet = await this.conditionEvaluator.evaluateConditions(
          transfer.conditions,
          transfer,
          states
        );
        if (!conditionsMet) {
          continue; // Skip if conditions not met
        }
      }

      // Try to solve the transfer
      const trade = await this.solve(transfer, states);
      if (trade) {
        // Evaluate the trade (risk and profit in parallel)
        const [risk, profitScore] = await Promise.all([
          this.riskManager.assessRisk(trade, transfer, states),
          this.profitOptimizer.calculateProfitScore(trade, transfer, states)
        ]);
        
        // Only consider trades below risk threshold
        if (risk < this.riskManager.maxRisk) {
          // Calculate overall score (profit score - risk penalty)
          const score = profitScore - (risk * 10); // Penalize risk heavily
          
          potentialTrades.push({ trade, transfer, score, risk });
        }
      }
    }

    // Sort by score (highest first) - risk already filtered
    const acceptableTrades = potentialTrades
      .sort((a, b) => b.score - a.score);

    // Commit tokens for accepted trades (prevent double-spending)
    const finalTrades: Trade[] = [];
    for (const { trade, transfer, score } of acceptableTrades) {
      const destChainId = normalizeChainId(trade.destChainId);
      const destState = states.get(destChainId);
      if (!destState) continue;

      const tokenBalance = destState.tokenBalances.get(trade.tokenOutAddr) || BigInt(0);
      if (tokenBalance >= trade.swapAmount) {
        // Commit tokens
        destState.tokenBalances.set(trade.tokenOutAddr, tokenBalance - trade.swapAmount);
        finalTrades.push(trade);
        console.log(`   ✅ Found executable trade: ${transfer.requestId.slice(0, 16)}... (dest: ${destChainId}, amount: ${trade.swapAmount}, score: ${score.toFixed(2)})`);
      }
    }

    return finalTrades;
  }

  /**
   * Solve a single transfer request (enhanced with better checks)
   */
  private async solve(
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<Trade | null> {
    const {
      dstChainId,
      amountOut,
      solverFee,
      executed,
    } = transfer.params;

    const destChainId = normalizeChainId(dstChainId);
    const destState = states.get(destChainId);

    if (!destState) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - destination chain ${destChainId} not found`);
      return null;
    }

    // Skip if already executed
    if (executed) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - already executed`);
      return null;
    }

    // Skip if already fulfilled
    const normalizedRequestId = transfer.requestId.toLowerCase();
    const isFulfilled = destState.alreadyFulfilled.some(
      (id) => id.toLowerCase() === normalizedRequestId
    );
    if (isFulfilled) {
      return null;
    }

    // Check native balance
    if (destState.nativeBalance === BigInt(0)) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - native balance too low`);
      return null;
    }

    // Check token balance
    const tokenAddress = transfer.params.tokenOut.toLowerCase();
    const tokenBalance = destState.tokenBalances.get(tokenAddress);

    if (tokenBalance === undefined) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - token not found`);
      return null;
    }

    if (tokenBalance === BigInt(0) || tokenBalance < amountOut) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - token balance too low (have: ${tokenBalance}, need: ${amountOut})`);
      return null;
    }

    // Check solver fee (enhanced check)
    if (solverFee < this.riskManager.minSolverFee) {
      console.log(`   ⏭️  Skipping ${transfer.requestId.slice(0, 16)}... - fee too low (${solverFee})`);
      return null;
    }

    // Convert transfer to trade
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

