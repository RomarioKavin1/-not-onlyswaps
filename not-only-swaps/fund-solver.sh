#!/usr/bin/env bash

# Funds the solver wallet with native ETH and tokens on both chains
# Usage: ./fund-solver.sh [solver-address]
# If solver-address is not provided, it will be derived from SOLVER_PRIVATE_KEY env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default private key (first Hardhat account)
PRIVATE_KEY="${SOLVER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

# Get solver address from argument or derive from private key
if [ $# -ge 1 ]; then
  SOLVER_ADDRESS="$1"
else
  # Derive address from private key using cast
  SOLVER_ADDRESS=$(cast wallet address "$PRIVATE_KEY" 2>/dev/null || echo "0xa0Ee7A142d267C1f36714E4a8F79612F20a79720")
fi

echo "[+] Funding solver wallet: $SOLVER_ADDRESS"

# Fund native ETH on chain 31337
echo "[+] Funding native ETH on chain 31337..."
cast send --value 10ether "$SOLVER_ADDRESS" --private-key "$PRIVATE_KEY" --rpc-url https://blue.crevn.xyz || echo "⚠️  Failed to fund chain 31337 (chain might not be running)"

# Fund native ETH on chain 31338
echo "[+] Funding native ETH on chain 31338..."
cast send --value 10ether "$SOLVER_ADDRESS" --private-key "$PRIVATE_KEY" --rpc-url https://green.crevn.xyz || echo "⚠️  Failed to fund chain 31338 (chain might not be running)"

# Get token address from config or use default
TOKEN_ADDRESS="${TOKEN_ADDRESS:-0x6b0fb8117c30b5ae16db76ab7a1f2bde9f7ed61b}"

echo "[+] Fauceting tokens on chain 31337..."
# Try faucet() first, then try faucet(address) if that fails
if ! cast send "$TOKEN_ADDRESS" "faucet()" --private-key "$PRIVATE_KEY" --rpc-url https://blue.crevn.xyz 2>/dev/null; then
  echo "   Trying faucet(address)..."
  cast send "$TOKEN_ADDRESS" "faucet(address)" "$SOLVER_ADDRESS" --private-key "$PRIVATE_KEY" --rpc-url https://blue.crevn.xyz || echo "⚠️  Failed to faucet tokens on chain 31337"
fi

echo "[+] Fauceting tokens on chain 31338..."
# Try faucet() first, then try faucet(address) if that fails
if ! cast send "$TOKEN_ADDRESS" "faucet()" --private-key "$PRIVATE_KEY" --rpc-url https://green.crevn.xyz 2>/dev/null; then
  echo "   Trying faucet(address)..."
  cast send "$TOKEN_ADDRESS" "faucet(address)" "$SOLVER_ADDRESS" --private-key "$PRIVATE_KEY" --rpc-url https://green.crevn.xyz || echo "⚠️  Failed to faucet tokens on chain 31338"
fi

# Check if we need to transfer tokens manually
echo ""
echo "[+] Checking token balances..."
BALANCE_31337=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)" "$SOLVER_ADDRESS" --rpc-url https://blue.crevn.xyz 2>/dev/null | cast --to-dec || echo "0")
BALANCE_31338=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)" "$SOLVER_ADDRESS" --rpc-url https://green.crevn.xyz 2>/dev/null | cast --to-dec || echo "0")

echo "   Chain 31337 balance: $BALANCE_31337"
echo "   Chain 31338 balance: $BALANCE_31338"

if [ "$BALANCE_31338" = "0" ] && [ "$BALANCE_31337" != "0" ]; then
  echo ""
  echo "[!] Warning: Solver has tokens on chain 31337 but not on chain 31338"
  echo "[!] You may need to manually transfer tokens or use a bridge to fund chain 31338"
  echo "[!] Or ensure the faucet function is callable by your address"
fi

echo "[+] Funding complete!"
echo "[+] Solver address: $SOLVER_ADDRESS"
echo "[+] Token address: $TOKEN_ADDRESS"

