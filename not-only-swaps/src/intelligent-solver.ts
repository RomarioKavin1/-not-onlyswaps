/**
 * Intelligent Solver with Optimization
 * 
 * Makes smart decisions about which trades to execute based on
 * profitability, risk, gas costs, and portfolio optimization
 */

import { Transfer, Trade, ChainState } from './model.js';
import { RoutingEngine, SwapPath } from './routing-engine.js';
import { ConditionEvaluator, ConditionResult } from './condition-evaluator.js';

/**
 * Trade score and ranking
 */
export interface TradeScore {
  trade: Trade;
  profitability: bigint; // fee - gas - risk buffer
  gasEstimate: bigint;
  riskScore: number; // 0-100, higher = riskier
  priority: number; // Higher = more important
  executionTime: number; // Estimated execution time in seconds
  routingPath?: SwapPath; // If routing is needed
  conditionResults?: ConditionResult[]; // If conditions exist
}

/**
 * Solver constraints
 */
export interface SolverConstraints {
  maxGasPerBlock: bigint;
  minProfitability: bigint; // Minimum profit threshold
  maxRiskScore: number; // Maximum acceptable risk (0-100)
  maxConcurrentTrades: number;
  maxExposurePerToken: bigint; // Maximum exposure per token
  maxExposurePerChain: bigint; // Maximum exposure per chain
}

/**
 * Portfolio state for optimization
 */
export interface PortfolioState {
  tokenBalances: Map<string, Map<number, bigint>>; // token -> chainId -> balance
  totalValue: bigint; // Total portfolio value
  exposure: Map<string, bigint>; // token -> total exposure
}

/**
 * Intelligent solver that optimizes trade selection
 */
export class IntelligentSolver {
  private routingEngine: RoutingEngine;
  private conditionEvaluator: ConditionEvaluator;
  private constraints: SolverConstraints;
  private portfolioState: PortfolioState;
  
  constructor(
    routingEngine: RoutingEngine,
    conditionEvaluator: ConditionEvaluator,
    constraints: SolverConstraints
  ) {
    this.routingEngine = routingEngine;
    this.conditionEvaluator = conditionEvaluator;
    this.constraints = constraints;
    this.portfolioState = {
      tokenBalances: new Map(),
      totalValue: BigInt(0),
      exposure: new Map(),
    };
  }
  
  /**
   * Score and rank all potential trades
   */
  async scoreTrades(
    transfers: Transfer[],
    states: Map<number, ChainState>,
    gasPrices: Map<number, bigint> // chainId -> gas price in wei
  ): Promise<TradeScore[]> {
    const scores: TradeScore[] = [];
    
    for (const transfer of transfers) {
      try {
        const score = await this.scoreTrade(transfer, states, gasPrices);
        if (score) {
          scores.push(score);
        }
      } catch (error) {
        console.error(`Error scoring trade ${transfer.requestId}:`, error);
      }
    }
    
    // Sort by priority (highest first)
    scores.sort((a, b) => b.priority - a.priority);
    
    return scores;
  }
  
  /**
   * Score a single trade
   */
  private async scoreTrade(
    transfer: Transfer,
    states: Map<number, ChainState>,
    gasPrices: Map<number, bigint>
  ): Promise<TradeScore | null> {
    // Check conditions first
    const conditionResults = await this.conditionEvaluator.evaluate(transfer, states);
    const conditionsMet = conditionResults.every(r => r.met);
    
    if (!conditionsMet) {
      return null; // Conditions not met, skip
    }
    
    // Check if we can fulfill directly or via routing
    const destChainId = Number(transfer.params.dstChainId);
    const destState = states.get(destChainId);
    if (!destState) {
      return null;
    }
    
    const tokenOut = transfer.params.tokenOut.toLowerCase();
    const amountOut = transfer.params.amountOut;
    const directBalance = destState.tokenBalances.get(tokenOut) || BigInt(0);
    
    let routingPath: SwapPath | undefined;
    let canFulfill = directBalance >= amountOut;
    
    // If direct balance insufficient, try routing
    if (!canFulfill) {
      routingPath = await this.routingEngine.canFulfillViaRouting(transfer);
      canFulfill = routingPath !== null;
    }
    
    if (!canFulfill) {
      return null; // Cannot fulfill
    }
    
    // Estimate gas costs
    const gasEstimate = routingPath
      ? routingPath.totalGasEstimate
      : await this.estimateGasCost(transfer, destChainId);
    
    const gasPrice = gasPrices.get(destChainId) || BigInt(0);
    const gasCost = gasEstimate * gasPrice;
    
    // Calculate profitability
    const solverFee = transfer.params.solverFee;
    const profitability = solverFee - gasCost;
    
    // Check minimum profitability
    if (profitability < this.constraints.minProfitability) {
      return null; // Not profitable enough
    }
    
    // Assess risk
    const riskScore = await this.assessRisk(transfer, destState, routingPath);
    
    if (riskScore > this.constraints.maxRiskScore) {
      return null; // Too risky
    }
    
    // Calculate priority
    const priority = this.calculatePriority(transfer, profitability, riskScore);
    
    // Estimate execution time
    const executionTime = routingPath
      ? routingPath.executionTime
      : this.estimateExecutionTime(destChainId);
    
    // Convert to trade
    const trade: Trade = {
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
    
    return {
      trade,
      profitability,
      gasEstimate,
      riskScore,
      priority,
      executionTime,
      routingPath,
      conditionResults,
    };
  }
  
  /**
   * Select optimal trades using knapsack-like optimization
   */
  selectOptimalTrades(
    scoredTrades: TradeScore[],
    states: Map<number, ChainState>
  ): Trade[] {
    // Filter by constraints
    const filtered = scoredTrades.filter(score => {
      // Check gas constraints
      // Check exposure limits
      // Check concurrent trade limits
      return true; // Simplified for now
    });
    
    // Greedy selection: take highest priority trades until constraints met
    const selected: Trade[] = [];
    let totalGas = BigInt(0);
    
    for (const score of filtered) {
      if (totalGas + score.gasEstimate > this.constraints.maxGasPerBlock) {
        continue; // Would exceed gas limit
      }
      
      // Check exposure limits
      if (!this.checkExposureLimits(score.trade, states)) {
        continue;
      }
      
      selected.push(score.trade);
      totalGas += score.gasEstimate;
      
      if (selected.length >= this.constraints.maxConcurrentTrades) {
        break;
      }
    }
    
    return selected;
  }
  
  /**
   * Assess risk of a trade
   */
  private async assessRisk(
    transfer: Transfer,
    destState: ChainState,
    routingPath?: SwapPath
  ): Promise<number> {
    let riskScore = 0;
    
    // Base risk
    riskScore += 10;
    
    // Chain congestion risk (would need gas price data)
    // High gas prices = higher risk
    riskScore += 20;
    
    // Routing risk
    if (routingPath) {
      riskScore += 30; // Multi-hop adds risk
      if (routingPath.confidence < 0.8) {
        riskScore += 20; // Low confidence path
      }
    }
    
    // Balance risk (using large portion of balance)
    const tokenOut = transfer.params.tokenOut.toLowerCase();
    const balance = destState.tokenBalances.get(tokenOut) || BigInt(0);
    const usageRatio = Number(transfer.params.amountOut) / Number(balance);
    if (usageRatio > 0.8) {
      riskScore += 30; // Using >80% of balance
    } else if (usageRatio > 0.5) {
      riskScore += 15; // Using >50% of balance
    }
    
    // Slippage risk (if routing)
    if (routingPath) {
      const maxPriceImpact = Math.max(...routingPath.hops.map(h => h.priceImpact));
      riskScore += Math.min(maxPriceImpact, 50); // Cap at 50
    }
    
    return Math.min(riskScore, 100); // Cap at 100
  }
  
  /**
   * Calculate priority score
   */
  private calculatePriority(
    transfer: Transfer,
    profitability: bigint,
    riskScore: number
  ): number {
    // Higher profitability = higher priority
    const profitScore = Number(profitability) / 1e18 * 100; // Normalize
    
    // Lower risk = higher priority
    const riskPenalty = riskScore;
    
    // Time sensitivity (if requestedAt is old, might be urgent)
    const requestedAt = transfer.params.requestedAt;
    const age = Date.now() / 1000 - Number(requestedAt);
    const timeScore = Math.min(age / 3600, 10); // Older = slightly higher priority
    
    return profitScore - riskPenalty + timeScore;
  }
  
  /**
   * Estimate gas cost for a trade
   */
  private async estimateGasCost(
    transfer: Transfer,
    chainId: number
  ): Promise<bigint> {
    // Base gas estimate (would need actual estimation)
    return BigInt(200000); // Simplified
  }
  
  /**
   * Estimate execution time
   */
  private estimateExecutionTime(chainId: number): number {
    // Would depend on chain block time
    // EVM: ~12-15 seconds, Solana: ~1 second, etc.
    return 15; // Default 15 seconds
  }
  
  /**
   * Check exposure limits
   */
  private checkExposureLimits(
    trade: Trade,
    states: Map<number, ChainState>
  ): boolean {
    const token = trade.tokenOutAddr.toLowerCase();
    const chainId = Number(trade.destChainId);
    
    // Check per-token exposure
    const currentExposure = this.portfolioState.exposure.get(token) || BigInt(0);
    if (currentExposure + trade.swapAmount > this.constraints.maxExposurePerToken) {
      return false;
    }
    
    // Check per-chain exposure (simplified)
    // Would need to track total exposure per chain
    
    return true;
  }
  
  /**
   * Update portfolio state
   */
  updatePortfolio(states: Map<number, ChainState>): void {
    // Recalculate portfolio state from chain states
    // This would be called periodically to keep portfolio state updated
  }
}

