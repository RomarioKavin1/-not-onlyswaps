# Integration Guide: Upgrading the Solver

This guide shows how to integrate the proposed innovations into the existing solver.

## Overview

The current `Solver` class in `solver.ts` is simple and direct. The innovations add layers of intelligence and capability while maintaining backward compatibility.

## Integration Steps

### Step 1: Refactor Network to ChainAdapter

**Current**: `Network` class is EVM-specific  
**Target**: `Network` implements `EVMAdapter` which implements `ChainAdapter`

```typescript
// Before: solver.ts uses Network directly
const solver = await Solver.from(networks);

// After: solver.ts uses ChainAdapter
const adapters = new Map<number, ChainAdapter>();
for (const [chainId, network] of networks) {
  adapters.set(chainId, new EVMAdapter(chainId, /* ... */));
}
const solver = await IntelligentSolver.from(adapters);
```

### Step 2: Enhance Solver with Routing

**Current**: `solve()` only checks direct balance  
**Target**: Check routing if direct balance insufficient

```typescript
// In solver.ts, modify solve() method:

private async solve(
  transfer: Transfer,
  states: Map<number, ChainState>
): Promise<Trade | null> {
  // ... existing checks ...
  
  // Check direct balance (existing logic)
  const tokenBalance = destState.tokenBalances.get(tokenAddress);
  if (tokenBalance && tokenBalance >= amountOut) {
    // Existing direct fulfillment
    return this.createTrade(transfer);
  }
  
  // NEW: Try routing if direct balance insufficient
  const routingPath = await this.routingEngine.canFulfillViaRouting(transfer);
  if (routingPath && routingPath.profitability > BigInt(0)) {
    // Can fulfill via routing
    return this.createTrade(transfer, routingPath);
  }
  
  return null;
}
```

### Step 3: Add Condition Evaluation

**Current**: No condition checking  
**Target**: Evaluate conditions before solving

```typescript
// In solver.ts, modify calculateTrades():

private async calculateTrades(
  chainId: number,
  inFlight: NodeCache
): Promise<Trade[]> {
  // ... existing code ...
  
  for (const transfer of unfulfilledTransfers) {
    // NEW: Check conditions first
    const conditionResults = await this.conditionEvaluator.evaluate(
      transfer,
      this.states
    );
    
    const conditionsMet = conditionResults.every(r => r.met);
    if (!conditionsMet) {
      console.log(`   ⏭️  Conditions not met for ${transfer.requestId}`);
      continue;
    }
    
    // Existing solve logic...
    const trade = await this.solve(transfer, states);
    // ...
  }
}
```

### Step 4: Replace Solver with IntelligentSolver

**Current**: `Solver` processes trades sequentially  
**Target**: `IntelligentSolver` optimizes trade selection

```typescript
// In app.ts, replace Solver with IntelligentSolver:

// Before:
const solver = await Solver.from(networks);

// After:
const routingEngine = new RoutingEngine([
  new OneInchAggregator(),
  // Add more aggregators as needed
]);

const conditionEvaluator = new ConditionEvaluator();

const constraints: SolverConstraints = {
  maxGasPerBlock: BigInt(30000000),
  minProfitability: BigInt(1000000000000000), // 0.001 ETH
  maxRiskScore: 70,
  maxConcurrentTrades: 5,
  maxExposurePerToken: BigInt('1000000000000000000000'), // 1000 tokens
  maxExposurePerChain: BigInt('10000000000000000000000'), // 10000 tokens
};

const solver = new IntelligentSolver(
  routingEngine,
  conditionEvaluator,
  constraints
);
```

### Step 5: Update Trade Execution Flow

**Current**: Execute trades immediately  
**Target**: Score, rank, and optimize before execution

```typescript
// In app.ts, modify the event loop:

// Before:
const trades = await solver.fetchState(chainId, inFlightRequests);
await executor.execute(trades, inFlightRequests);

// After:
const transfers = await solver.fetchState(chainId, inFlightRequests);
const states = solver.getStates(); // Get current states

// Get current gas prices
const gasPrices = await this.fetchGasPrices(networks);

// Score and optimize trades
const scoredTrades = await solver.scoreTrades(transfers, states, gasPrices);
const optimalTrades = solver.selectOptimalTrades(scoredTrades, states);

// Execute optimized trades
await executor.execute(optimalTrades, inFlightRequests);
```

## Migration Path

### Phase 1: Add Features Alongside Existing Code

1. Create new classes (`RoutingEngine`, `ConditionEvaluator`, etc.)
2. Keep existing `Solver` class working
3. Add feature flags in config:

```toml
[solver]
enable_routing = false  # Start disabled
enable_conditions = false
enable_intelligence = false
```

### Phase 2: Gradual Migration

1. Enable routing for testing
2. Enable conditions for specific chains
3. Enable intelligence with conservative constraints

### Phase 3: Full Migration

1. Replace `Solver` with `IntelligentSolver` as default
2. Remove old `Solver` class (or keep as fallback)
3. Update all documentation

## Configuration Example

```toml
[agent]
healthcheck_listen_addr = "0.0.0.0"
healthcheck_port = 8081

[solver]
min_profitability_wei = 1000000000000000  # 0.001 ETH
max_risk_score = 70
max_gas_per_block = 30000000
max_concurrent_trades = 5
enable_routing = true
enable_conditions = true
enable_intelligence = true

[routing]
dex_aggregators = ["1inch", "0x"]
max_hops = 3
routing_cache_ttl = 60

[conditions]
price_oracle = "chainlink"
time_conditions_enabled = true

[[networks]]
chain_id = 43113
chain_type = "evm"  # NEW: specify chain type
rpc_url = "wss://..."
tokens = ["0x..."]
router_address = "0x..."

[[networks]]
chain_id = 101
chain_type = "solana"  # NEW: non-EVM chain
rpc_url = "https://..."
tokens = ["So11111111111111111111111111111111111111112"]
router_address = "..."
```

## Backward Compatibility

The innovations are designed to be backward compatible:

1. **ChainAdapter**: Existing `Network` class can be wrapped as `EVMAdapter`
2. **Routing**: Falls back to direct balance check if routing unavailable
3. **Conditions**: If no conditions specified, all transfers pass
4. **Intelligence**: Can run with permissive constraints (effectively disabled)

## Testing Strategy

1. **Unit Tests**: Test each component independently
   - `RoutingEngine.findBestPath()`
   - `ConditionEvaluator.evaluate()`
   - `IntelligentSolver.scoreTrades()`

2. **Integration Tests**: Test components together
   - Routing + Conditions
   - Intelligence + Execution
   - Multi-chain scenarios

3. **E2E Tests**: Test full flow
   - Real chain state (testnets)
   - Mock DEX aggregators
   - Simulated conditions

## Performance Considerations

1. **Caching**: Route results cached to avoid redundant API calls
2. **Parallel Processing**: Score trades in parallel
3. **Lazy Evaluation**: Only evaluate conditions when needed
4. **Batch Operations**: Batch RPC calls where possible

## Monitoring

Add metrics for:
- Routing success rate
- Condition evaluation time
- Trade profitability
- Gas optimization savings
- Risk score distribution

## Rollback Plan

If issues arise:
1. Disable features via config flags
2. Fall back to existing `Solver` class
3. Keep old code path available for 2-3 releases

