# Solver V2 - Enhanced with Conditions & Intelligence

This document explains how to use the enhanced solver (`solver-v2.ts`) which includes **conditional execution** and **intelligent optimization**.

## Features

### ✅ Phase 3: Conditional Execution
- **Price conditions**: Execute swaps only when token prices meet certain criteria
- **Time conditions**: Schedule swaps for specific times
- **Balance conditions**: Execute only when balances are sufficient
- **Custom conditions**: Define your own JavaScript evaluation functions

### ✅ Phase 4: Intelligent Optimization
- **Risk management**: Automatically assess and filter trades by risk
- **Profit optimization**: Calculate net profit considering gas costs and opportunity costs
- **Smart scoring**: Rank trades by profitability and risk
- **Price oracle**: Fetch token prices from multiple sources (with caching)

## Usage

### Basic Usage (Drop-in Replacement)

The new solver is a drop-in replacement for the original solver:

```typescript
import { SolverV2 } from './solver-v2.js';
import { Network } from './network.js';

// Create networks (same as before)
const networks = await Network.createMany(privateKey, networkConfigs);

// Use SolverV2 instead of Solver
const solver = await SolverV2.from(networks);

// Use it exactly like the old solver
const trades = await solver.fetchState(chainId, inFlightCache);
```

### Adding Conditions to Transfers

Conditions are optional and can be added to transfers. The solver will evaluate them before executing trades.

#### Example 1: Price Condition

```typescript
const transfer: Transfer = {
  requestId: "0x...",
  params: { /* ... */ },
  conditions: [
    {
      type: 'price',
      operator: 'gte', // greater than or equal
      params: {
        tokenPair: 'USDC/DAI',
        chainId: 1,
        value: 0.99 // Only execute if USDC/DAI >= 0.99
      }
    }
  ]
};
```

#### Example 2: Time Condition

```typescript
const transfer: Transfer = {
  requestId: "0x...",
  params: { /* ... */ },
  conditions: [
    {
      type: 'time',
      operator: 'gte',
      params: {
        timestamp: Date.now() + 3600000 // Execute after 1 hour
      }
    }
  ]
};
```

#### Example 3: Balance Condition

```typescript
const transfer: Transfer = {
  requestId: "0x...",
  params: { /* ... */ },
  conditions: [
    {
      type: 'balance',
      operator: 'gte',
      params: {
        chainId: 1,
        token: '0x...', // Token address (optional, checks native if omitted)
        minAmount: BigInt('1000000000000000000') // 1 ETH minimum
      }
    }
  ]
};
```

#### Example 4: Multiple Conditions

```typescript
const transfer: Transfer = {
  requestId: "0x...",
  params: { /* ... */ },
  conditions: [
    {
      type: 'price',
      operator: 'gte',
      params: { tokenPair: 'USDC/DAI', value: 0.99 }
    },
    {
      type: 'time',
      operator: 'gte',
      params: { timestamp: Date.now() + 3600000 }
    },
    {
      type: 'balance',
      operator: 'gte',
      params: { chainId: 1, minAmount: BigInt('1000000000000000000') }
    }
  ],
  maxWaitTime: 3600000, // Wait up to 1 hour for conditions
  priority: 10 // Higher priority = executed first
};
```

#### Example 5: Custom Condition

```typescript
const transfer: Transfer = {
  requestId: "0x...",
  params: { /* ... */ },
  conditions: [
    {
      type: 'custom',
      operator: 'eq', // Not used for custom
      params: {
        evaluator: async (transfer: Transfer, states: Map<number, ChainState>) => {
          // Your custom logic here
          const destState = states.get(Number(transfer.params.dstChainId));
          if (!destState) return false;
          
          // Example: Only execute on weekends
          const day = new Date().getDay();
          return day === 0 || day === 6;
        }
      }
    }
  ]
};
```

## Condition Operators

- `gt`: Greater than
- `lt`: Less than
- `eq`: Equal to
- `gte`: Greater than or equal to
- `lte`: Less than or equal to
- `between`: Between two values (requires `max` param)

## Intelligent Features

### Risk Management

The solver automatically assesses risk for each trade:

- **Liquidity Risk**: Checks if sufficient tokens are available
- **Fee Risk**: Validates that solver fees are profitable
- **Execution Risk**: Verifies gas balance and network conditions
- **Counterparty Risk**: Basic checks on sender/recipient addresses

Trades with risk above the threshold (default: 30%) are automatically filtered out.

### Profit Optimization

The solver calculates net profit considering:

- **Solver Fee**: The fee paid by the user
- **Gas Cost**: Estimated gas cost for execution
- **Opportunity Cost**: Cost of locking capital

Trades are ranked by profitability score, with the most profitable trades executed first.

### Configuration

You can customize the risk manager and profit optimizer:

```typescript
// Access the risk manager
solver.riskManager.maxRisk = 0.2; // Lower threshold (20%)
solver.riskManager.minSolverFee = BigInt('2000000000000000'); // 0.002 ETH minimum

// The profit optimizer uses gas price estimator
// Gas prices are cached for 30 seconds
```

## Price Oracle

The price oracle fetches prices from multiple sources:

1. **Coingecko API** (if available)
2. **Chainlink** (if available)
3. **Fallback**: Estimates based on token pairs

Prices are cached for 1 minute to reduce API calls.

### Adding Price Sources

To add more price sources, extend the `PriceOracle` class:

```typescript
class CustomPriceOracle extends PriceOracle {
  private async fetchFromCoingecko(tokenPair: string, chainId: number): Promise<number> {
    // Implement Coingecko API call
    const response = await fetch(`https://api.coingecko.com/...`);
    const data = await response.json();
    return data.price;
  }
}
```

## Migration from Solver V1

The new solver is backward compatible. Existing code will work without changes:

```typescript
// Old code (still works)
import { Solver } from './solver.js';
const solver = await Solver.from(networks);

// New code (with conditions & intelligence)
import { SolverV2 } from './solver-v2.js';
const solver = await SolverV2.from(networks);
```

The only difference is that `SolverV2` will:
- Evaluate conditions if present
- Filter trades by risk
- Rank trades by profitability
- Provide better logging with scores

## Performance Considerations

- **Condition Evaluation**: Conditions are evaluated sequentially. Complex custom conditions may slow down processing.
- **Risk Assessment**: Risk is calculated in parallel with profit scoring for efficiency.
- **Price Caching**: Prices are cached for 1 minute to reduce API calls.
- **Gas Price Caching**: Gas prices are cached for 30 seconds.

## Example: Complete Usage

```typescript
import { SolverV2 } from './solver-v2.js';
import { Network } from './network.js';
import { Transfer, Condition } from './model.js';

// Setup networks
const networks = await Network.createMany(privateKey, networkConfigs);

// Create solver
const solver = await SolverV2.from(networks);

// Create transfer with conditions
const transfer: Transfer = {
  requestId: "0x123...",
  params: {
    srcChainId: BigInt(1),
    dstChainId: BigInt(137),
    tokenIn: "0x...",
    tokenOut: "0x...",
    amountOut: BigInt("1000000000000000000"),
    solverFee: BigInt("10000000000000000"),
    // ... other params
  },
  conditions: [
    {
      type: 'price',
      operator: 'gte',
      params: {
        tokenPair: 'USDC/DAI',
        chainId: 137,
        value: 0.99
      }
    }
  ],
  priority: 5
};

// The solver will automatically:
// 1. Evaluate conditions
// 2. Assess risk
// 3. Calculate profit
// 4. Rank and execute trades
const trades = await solver.fetchState(chainId, inFlightCache);
```

## Troubleshooting

### Conditions Not Met

If conditions are not met, trades will be skipped. Check logs for:
```
⏸️  Condition not met for 0x123...: price gte
```

### High Risk Trades Filtered

If trades are being filtered due to risk, check:
- Token balances
- Gas balance
- Solver fee amounts

Adjust `riskManager.maxRisk` if needed (but be careful!).

### Price Oracle Failures

If price fetching fails, the solver will:
- Log a warning
- Skip price-based conditions (fail-safe)
- Continue with other trades

## Future Enhancements

Potential improvements:
- More price oracle sources (Uniswap, Curve, etc.)
- Historical price data for better estimates
- Machine learning for risk prediction
- Dynamic risk thresholds based on market conditions
- Batch condition evaluation for better performance

