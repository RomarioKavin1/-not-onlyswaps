# Local Swap Script

This script performs a cross-chain swap between two local chains (31337 and 31338) using the onlyswaps-js library.

## Prerequisites

1. **Docker containers running**: Ensure your local Docker containers are running:

   ```bash
   docker compose up -d
   ```

2. **Chains accessible**: Verify that the chains are accessible at:

   - `http://localhost:31337` (Chain 31337)
   - `http://localhost:31338` (Chain 31338)

3. **Contracts deployed**: Ensure the router and RUSD token are deployed at:

   - Router: `0xa504fbff16352e397e3bc1459a284c4426c55787`
   - RUSD: `0x6b0fb8117c30b5ae16db76ab7a1f2bde9f7ed61b`

4. **Account funded**: The script uses the Anvil default account #0 which should be funded on both chains.

## Installation

Install dependencies:

```bash
npm install
```

## Configuration

### Fee API (Optional)

If you have a local solver API that exposes a fees endpoint, you can set the `FEE_API_URL` environment variable:

```bash
export FEE_API_URL=http://localhost:3000/api/fees
```

If not set, the script will use manual fee values (0.01 RUSD solver fee) for local testing.

## Usage

Run the swap script:

```bash
npm run swap
```

Or use the watch mode for development:

```bash
npm run dev
```

## What the Script Does

1. **Initializes clients**: Sets up viem clients for the local chains
2. **Fetches fees**: Gets recommended fees from your local solver API (or uses manual values)
3. **Executes swap**: Performs a cross-chain swap of 1 RUSD from chain 31337 to chain 31338
4. **Tracks status**: Checks the swap request parameters and fulfillment receipt

## Customization

You can modify the swap parameters in the `main()` function:

- `amount`: Amount to swap (default: 1 RUSD = 1000000000000000000n)
- `recipient`: Address to receive tokens (default: same as sender)
- `fee`: Solver fee (fetched from API or manual)

## Chain Configuration

The script uses custom chain definitions for:

- **Chain 31337**: Local Chain 1 (source chain)
- **Chain 31338**: Local Chain 2 (destination chain)

Both chains use the same router and RUSD token addresses.
