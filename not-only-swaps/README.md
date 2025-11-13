# OnlySwaps Solver (TypeScript)

TypeScript implementation of the OnlySwaps cross-chain swap solver. This solver monitors multiple blockchains for swap opportunities and executes profitable trades.

## Features

- **Event-driven architecture**: Listens to block events from multiple chains via WebSocket
- **Cross-chain arbitrage**: Finds and executes profitable swap opportunities across chains
- **State management**: Tracks balances, unfulfilled requests, and in-flight transactions
- **Automatic execution**: Executes trades when profitable conditions are met

## Installation

```bash
yarn install
```

## Build

```bash
yarn build
```

## Configuration

The solver requires a configuration file in TOML format. See `config.example.toml` for an example.

### Environment Variables

| Environment Variable | Mandatory? | Description                                         | Example                                  |
|---------------------|------------|-----------------------------------------------------|------------------------------------------|
| `SOLVER_PRIVATE_KEY` | Yes        | A hex-encoded private key, with or without the `0x` | `0xdeadbeefdeadbeefdeadbeefdeadbeefdead` |
| `SOLVER_CONFIG_PATH` | No         | Path to your solver configuration TOML              | `/data/config.toml`                      | Default: `~/.config/onlyswaps/solver/config.toml` |

## Usage

### Development Mode

```bash
yarn dev --private-key <your-private-key> --config <path-to-config>
```

### Production Mode

```bash
yarn build
yarn start --private-key <your-private-key> --config <path-to-config>
```

## Configuration File Format

```toml
[agent]
healthcheck_listen_addr = "0.0.0.0"
healthcheck_port = 8081
log_level = "debug"
log_json = true

[[networks]]
chain_id = 43113
rpc_url = "wss://avalanche-fuji-c-chain-rpc.publicnode.com"
tokens = ["0x1b0F6cF6f3185872a581BD2B5a738EB52CCd4d76"]
router_address = "0x83b2dFc83E41a2398e28e31C352E1053805e4C16"

[[networks]]
chain_id = 84532
rpc_url = "wss://base-sepolia-rpc.publicnode.com"
tokens = ["0x1b0F6cF6f3185872a581BD2B5a738EB52CCd4d76"]
router_address = "0x83b2dFc83E41a2398e28e31C352E1053805e4C16"
```

## Architecture

### Components

1. **App**: Main event loop that merges block streams from all chains
2. **Network**: Manages WebSocket connections and fetches chain state
3. **Solver**: Calculates which trades are profitable/executable
4. **Executor**: Executes trades on-chain

### Flow

1. Subscribe to block events on all configured chains
2. On each new block:
   - Fetch updated chain state (balances, unfulfilled requests)
   - Calculate executable trades based on current state
   - Execute trades if any are found
3. Track in-flight requests to avoid duplicate executions

## Differences from Rust Implementation

- Uses `ethers.js` for blockchain interactions instead of `alloy`
- Uses `node-cache` for in-flight request tracking instead of `moka`
- Uses `commander` for CLI instead of `clap`
- Uses `toml` parser for configuration instead of Rust's `config` crate
- Block subscription uses polling instead of native WebSocket subscriptions (ethers.js limitation)

## Development

### Project Structure

```
ts-solver/
├── src/
│   ├── main.ts       # Entry point
│   ├── app.ts         # Main event loop
│   ├── config.ts      # Configuration handling
│   ├── executor.ts    # Trade execution
│   ├── model.ts       # Data structures
│   ├── network.ts     # Network/WebSocket management
│   ├── solver.ts      # Trade calculation logic
│   └── util.ts        # Utility functions
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT

