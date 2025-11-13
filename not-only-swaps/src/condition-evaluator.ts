/**
 * Conditional Swap Engine
 * 
 * Evaluates conditions for swap execution (time, price, balance, etc.)
 */

import { Transfer, ChainState } from './model.js';

/**
 * Base condition interface
 */
export interface SwapCondition {
  type: 'time' | 'price' | 'balance' | 'custom';
  id: string;
  description?: string;
}

/**
 * Time-based condition
 */
export interface TimeCondition extends SwapCondition {
  type: 'time';
  operator: 'after' | 'before' | 'between';
  timestamp: bigint; // Unix timestamp
  endTimestamp?: bigint; // For 'between' operator
}

/**
 * Price-based condition
 */
export interface PriceCondition extends SwapCondition {
  type: 'price';
  token: string;
  chainId: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  targetPrice: bigint; // Price in wei/smallest unit
  oracle: 'chainlink' | 'uniswap_twap' | 'custom';
  oracleAddress?: string; // For custom oracle
}

/**
 * Balance-based condition
 */
export interface BalanceCondition extends SwapCondition {
  type: 'balance';
  token?: string; // undefined = native token
  chainId: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: bigint;
}

/**
 * Custom condition (evaluated via external function)
 */
export interface CustomCondition extends SwapCondition {
  type: 'custom';
  evaluator: (state: ChainState, transfer: Transfer) => Promise<boolean>;
  data?: any; // Additional data for evaluator
}

/**
 * Condition evaluation result
 */
export interface ConditionResult {
  condition: SwapCondition;
  met: boolean;
  reason?: string;
  evaluatedAt: number; // Timestamp
}

/**
 * Condition evaluator engine
 */
export class ConditionEvaluator {
  private priceCache: Map<string, { price: bigint; timestamp: number }>;
  private cacheTTL: number = 60; // 60 seconds
  
  constructor() {
    this.priceCache = new Map();
  }
  
  /**
   * Evaluate all conditions for a transfer
   */
  async evaluate(
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<ConditionResult[]> {
    // Extract conditions from transfer (would need to extend Transfer interface)
    const conditions: SwapCondition[] = (transfer as any).conditions || [];
    
    if (conditions.length === 0) {
      // No conditions = always executable
      return [];
    }
    
    const results: ConditionResult[] = [];
    
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, transfer, states);
      results.push(result);
      
      // Short-circuit if any condition fails
      if (!result.met) {
        break;
      }
    }
    
    return results;
  }
  
  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: SwapCondition,
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<ConditionResult> {
    switch (condition.type) {
      case 'time':
        return this.evaluateTimeCondition(condition as TimeCondition, transfer);
      case 'price':
        return this.evaluatePriceCondition(condition as PriceCondition, states);
      case 'balance':
        return this.evaluateBalanceCondition(condition as BalanceCondition, states);
      case 'custom':
        return this.evaluateCustomCondition(condition as CustomCondition, transfer, states);
      default:
        return {
          condition,
          met: false,
          reason: `Unknown condition type: ${(condition as any).type}`,
          evaluatedAt: Date.now(),
        };
    }
  }
  
  /**
   * Evaluate time-based condition
   */
  private evaluateTimeCondition(
    condition: TimeCondition,
    transfer: Transfer
  ): ConditionResult {
    const now = BigInt(Math.floor(Date.now() / 1000));
    
    let met = false;
    let reason = '';
    
    switch (condition.operator) {
      case 'after':
        met = now >= condition.timestamp;
        reason = met
          ? `Current time (${now}) >= required time (${condition.timestamp})`
          : `Current time (${now}) < required time (${condition.timestamp})`;
        break;
      case 'before':
        met = now <= condition.timestamp;
        reason = met
          ? `Current time (${now}) <= required time (${condition.timestamp})`
          : `Current time (${now}) > required time (${condition.timestamp})`;
        break;
      case 'between':
        if (!condition.endTimestamp) {
          return {
            condition,
            met: false,
            reason: 'Between operator requires endTimestamp',
            evaluatedAt: Date.now(),
          };
        }
        met = now >= condition.timestamp && now <= condition.endTimestamp;
        reason = met
          ? `Current time (${now}) is between ${condition.timestamp} and ${condition.endTimestamp}`
          : `Current time (${now}) is not between ${condition.timestamp} and ${condition.endTimestamp}`;
        break;
    }
    
    return {
      condition,
      met,
      reason,
      evaluatedAt: Date.now(),
    };
  }
  
  /**
   * Evaluate price-based condition
   */
  private async evaluatePriceCondition(
    condition: PriceCondition,
    states: Map<number, ChainState>
  ): Promise<ConditionResult> {
    try {
      const currentPrice = await this.getTokenPrice(
        condition.token,
        condition.chainId,
        condition.oracle,
        condition.oracleAddress
      );
      
      let met = false;
      let reason = '';
      
      switch (condition.operator) {
        case 'gt':
          met = currentPrice > condition.targetPrice;
          break;
        case 'lt':
          met = currentPrice < condition.targetPrice;
          break;
        case 'gte':
          met = currentPrice >= condition.targetPrice;
          break;
        case 'lte':
          met = currentPrice <= condition.targetPrice;
          break;
        case 'eq':
          met = currentPrice === condition.targetPrice;
          break;
      }
      
      reason = `Current price (${currentPrice}) ${condition.operator} target price (${condition.targetPrice})`;
      
      return {
        condition,
        met,
        reason,
        evaluatedAt: Date.now(),
      };
    } catch (error: any) {
      return {
        condition,
        met: false,
        reason: `Error fetching price: ${error.message}`,
        evaluatedAt: Date.now(),
      };
    }
  }
  
  /**
   * Evaluate balance-based condition
   */
  private evaluateBalanceCondition(
    condition: BalanceCondition,
    states: Map<number, ChainState>
  ): ConditionResult {
    const state = states.get(condition.chainId);
    if (!state) {
      return {
        condition,
        met: false,
        reason: `Chain ${condition.chainId} not found in states`,
        evaluatedAt: Date.now(),
      };
    }
    
    const balance = condition.token
      ? state.tokenBalances.get(condition.token.toLowerCase()) || BigInt(0)
      : state.nativeBalance;
    
    let met = false;
    let reason = '';
    
    switch (condition.operator) {
      case 'gt':
        met = balance > condition.threshold;
        break;
      case 'lt':
        met = balance < condition.threshold;
        break;
      case 'gte':
        met = balance >= condition.threshold;
        break;
      case 'lte':
        met = balance <= condition.threshold;
        break;
    }
    
    reason = `Balance (${balance}) ${condition.operator} threshold (${condition.threshold})`;
    
    return {
      condition,
      met,
      reason,
      evaluatedAt: Date.now(),
    };
  }
  
  /**
   * Evaluate custom condition
   */
  private async evaluateCustomCondition(
    condition: CustomCondition,
    transfer: Transfer,
    states: Map<number, ChainState>
  ): Promise<ConditionResult> {
    try {
      const met = await condition.evaluator(states, transfer);
      return {
        condition,
        met,
        reason: met ? 'Custom condition met' : 'Custom condition not met',
        evaluatedAt: Date.now(),
      };
    } catch (error: any) {
      return {
        condition,
        met: false,
        reason: `Error evaluating custom condition: ${error.message}`,
        evaluatedAt: Date.now(),
      };
    }
  }
  
  /**
   * Get token price from oracle
   */
  private async getTokenPrice(
    token: string,
    chainId: number,
    oracle: string,
    oracleAddress?: string
  ): Promise<bigint> {
    // Check cache first
    const cacheKey = `${chainId}:${token}:${oracle}`;
    const cached = this.priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 1000) {
      return cached.price;
    }
    
    // Fetch from oracle
    let price: bigint;
    
    switch (oracle) {
      case 'chainlink':
        price = await this.getChainlinkPrice(token, chainId, oracleAddress);
        break;
      case 'uniswap_twap':
        price = await this.getUniswapTWAP(token, chainId);
        break;
      default:
        throw new Error(`Unsupported oracle: ${oracle}`);
    }
    
    // Cache result
    this.priceCache.set(cacheKey, {
      price,
      timestamp: Date.now(),
    });
    
    return price;
  }
  
  /**
   * Get price from Chainlink oracle
   */
  private async getChainlinkPrice(
    token: string,
    chainId: number,
    oracleAddress?: string
  ): Promise<bigint> {
    // Implementation would call Chainlink price feed contract
    // const priceFeed = new Contract(oracleAddress, CHAINLINK_ABI, provider);
    // const price = await priceFeed.latestRoundData();
    throw new Error('Chainlink oracle integration not implemented');
  }
  
  /**
   * Get TWAP from Uniswap
   */
  private async getUniswapTWAP(
    token: string,
    chainId: number
  ): Promise<bigint> {
    // Implementation would query Uniswap V3 TWAP oracle
    throw new Error('Uniswap TWAP integration not implemented');
  }
}

