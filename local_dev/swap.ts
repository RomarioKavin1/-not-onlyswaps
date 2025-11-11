import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RouterClient, ViemChainBackend } from "onlyswaps-js";

// Local chain configuration
const LOCAL_CHAIN_1 = defineChain({
  id: 31337,
  name: "Local Chain 1",
  network: "local-1",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://localhost:31337"],
    },
    public: {
      http: ["http://localhost:31337"],
    },
  },
});

const LOCAL_CHAIN_2 = defineChain({
  id: 31338,
  name: "Local Chain 2",
  network: "local-2",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://localhost:31338"],
    },
    public: {
      http: ["http://localhost:31338"],
    },
  },
});

// Local deployment addresses
const ROUTER_ADDRESS = "0xa504fbff16352e397e3bc1459a284c4426c55787" as Address;
const RUSD_ADDRESS = "0x6b0fb8117c30b5ae16db76ab7a1f2bde9f7ed61b" as Address;

// Anvil default account #0 private key
const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

// Fee API configuration - update this to point to your local solver API if available
// For now, using a placeholder that you can replace
const FEE_API_URL = "http://localhost:8080"; // Update with your local solver API

/**
 * Fetch recommended fees from local solver API or use manual values
 */
async function fetchRecommendedFees(params: {
  sourceToken: string;
  destinationToken: string;
  sourceChainId: bigint;
  destinationChainId: bigint;
  amount: bigint;
}) {
  try {
    // Try to fetch from local solver API
    const response = await fetch(FEE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceToken: params.sourceToken,
        destinationToken: params.destinationToken,
        sourceChainId: params.sourceChainId.toString(),
        destinationChainId: params.destinationChainId.toString(),
        amount: params.amount.toString(),
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        fees?: {
          solver?: string | number;
          network?: string | number;
          total?: string | number;
        };
        transferAmount?: string | number;
        approvalAmount?: string | number;
      };
      return {
        fees: {
          solver: BigInt(data.fees?.solver || "10000000000000000"), // 0.01 RUSD default
          network: BigInt(data.fees?.network || "0"),
          total: BigInt(data.fees?.total || "10000000000000000"),
        },
        transferAmount: BigInt(data.transferAmount || params.amount.toString()),
        approvalAmount: BigInt(data.approvalAmount || params.amount.toString()),
      };
    }
  } catch (error) {
    console.warn("Failed to fetch fees from API, using manual values:", error);
  }

  // Fallback to manual fee calculation for local testing
  // Adjust these values as needed for your local setup
  const solverFee = 10000000000000000n; // 0.01 RUSD
  const networkFee = 0n;
  const totalFee = solverFee + networkFee;

  return {
    fees: {
      solver: solverFee,
      network: networkFee,
      total: totalFee,
    },
    transferAmount: params.amount,
    approvalAmount: params.amount + totalFee,
  };
}

/**
 * Mint tokens from the faucet
 */
async function mintFromFaucet(
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  tokenAddress: Address
) {
  try {
    console.log("🚰 Minting tokens from faucet...");
    const hash = await walletClient.writeContract({
      chain: LOCAL_CHAIN_1,
      account,
      address: tokenAddress,
      abi: [
        {
          inputs: [],
          name: "mint",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ] as const,
      functionName: "mint",
      args: [],
    });

    console.log("   Transaction hash:", hash);

    // Wait for transaction to be mined
    const publicClient = createPublicClient({
      chain: LOCAL_CHAIN_1,
      transport: http("http://localhost:31337"),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("✅ Tokens minted successfully!");
    return receipt;
  } catch (error: any) {
    if (error?.message?.includes("Wait 24h")) {
      console.log(
        "⚠️  Faucet cooldown active, but you may already have tokens"
      );
    } else {
      throw error;
    }
  }
}

/**
 * Check token balance for an address
 */
async function checkBalance(
  publicClient: ReturnType<typeof createPublicClient>,
  tokenAddress: Address,
  userAddress: Address
): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: [
        {
          inputs: [{ name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [userAddress],
    });
    return balance as bigint;
  } catch (error) {
    console.error("Error checking balance:", error);
    return 0n;
  }
}

/**
 * Check if a swap request is fulfilled by checking the fulfilled transfers list
 */
async function isSwapFulfilled(
  requestId: `0x${string}`,
  routerAddress: Address,
  chainId: number
): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: chainId === 31337 ? LOCAL_CHAIN_1 : LOCAL_CHAIN_2,
    transport: http(`http://localhost:${chainId}`),
  });

  try {
    const fulfilledIds = (await publicClient.readContract({
      address: routerAddress,
      abi: [
        {
          name: "getFulfilledTransfers",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "bytes32[]" }],
        },
      ],
      functionName: "getFulfilledTransfers",
    })) as `0x${string}`[];

    return fulfilledIds.includes(requestId);
  } catch (error) {
    console.error("Error checking fulfilled transfers:", error);
    return false;
  }
}

/**
 * Wait for SwapRequestFulfilled event on the destination chain
 */
async function waitForFulfillmentEvent(
  requestId: `0x${string}`,
  routerAddress: Address,
  maxWaitTime: number = 300000 // 5 minutes default
): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: LOCAL_CHAIN_2,
    transport: http("http://localhost:31338"),
  });

  console.log(
    "⏳ Waiting for SwapRequestFulfilled event on destination chain..."
  );
  const startTime = Date.now();

  // Define the event ABI
  const swapFulfilledEventAbi = [
    {
      type: "event",
      name: "SwapRequestFulfilled",
      inputs: [
        { indexed: true, name: "requestId", type: "bytes32" },
        { indexed: true, name: "srcChainId", type: "uint256" },
        { indexed: true, name: "dstChainId", type: "uint256" },
        { indexed: false, name: "tokenIn", type: "address" },
        { indexed: false, name: "tokenOut", type: "address" },
        { indexed: false, name: "fulfilled", type: "bool" },
        { indexed: false, name: "solver", type: "address" },
        { indexed: false, name: "recipient", type: "address" },
        { indexed: false, name: "amountOut", type: "uint256" },
        { indexed: false, name: "fulfilledAt", type: "uint256" },
      ],
    },
  ] as const;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Get recent blocks
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > 100n ? currentBlock - 100n : 0n;

      const logs = await publicClient.getLogs({
        address: routerAddress,
        event: swapFulfilledEventAbi[0],
        args: {
          requestId,
        },
        fromBlock,
        toBlock: "latest",
      });

      if (logs.length > 0) {
        console.log("\n✅ Swap fulfilled! Event found:");
        console.log("   Block:", logs[0].blockNumber);
        console.log("   Transaction:", logs[0].transactionHash);
        if (logs[0].args) {
          console.log("   Solver:", logs[0].args.solver);
          console.log("   Recipient:", logs[0].args.recipient);
          console.log("   Amount Out:", logs[0].args.amountOut?.toString());
        }
        return true;
      }

      // Also check the fulfilled transfers list
      const isFulfilled = await isSwapFulfilled(
        requestId,
        routerAddress,
        LOCAL_CHAIN_2.id
      );
      if (isFulfilled) {
        console.log("\n✅ Swap fulfilled! Found in fulfilled transfers list.");
        return true;
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r   Checking... (${elapsed}s elapsed)`);

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      // If event query fails, just check the fulfilled transfers list
      const isFulfilled = await isSwapFulfilled(
        requestId,
        routerAddress,
        LOCAL_CHAIN_2.id
      );
      if (isFulfilled) {
        console.log("\n✅ Swap fulfilled! Found in fulfilled transfers list.");
        return true;
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r   Checking... (${elapsed}s elapsed)`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log("\n⚠️  Timeout reached. Swap may still be processing.");
  return false;
}

/**
 * Check token balances on both chains
 */
async function checkBalancesOnBothChains(
  tokenAddress: Address,
  userAddress: Address,
  requestId: `0x${string}`
): Promise<void> {
  console.log("\n💰 Checking balances on both chains...");

  // Check balance on source chain (31337)
  const sourceClient = createPublicClient({
    chain: LOCAL_CHAIN_1,
    transport: http("http://localhost:31337"),
  });

  const sourceBalance = await checkBalance(
    sourceClient,
    tokenAddress,
    userAddress
  );
  console.log(
    `   Chain ${LOCAL_CHAIN_1.id} (source) balance:`,
    sourceBalance.toString()
  );

  // Check balance on destination chain (31338)
  const destClient = createPublicClient({
    chain: LOCAL_CHAIN_2,
    transport: http("http://localhost:31338"),
  });

  const destBalance = await checkBalance(destClient, tokenAddress, userAddress);
  console.log(
    `   Chain ${LOCAL_CHAIN_2.id} (destination) balance:`,
    destBalance.toString()
  );

  // If swap is fulfilled, destination balance should have increased
  const isFulfilled = await isSwapFulfilled(
    requestId,
    ROUTER_ADDRESS,
    LOCAL_CHAIN_2.id
  );
  if (isFulfilled) {
    console.log(
      "\n✅ Swap is fulfilled - destination balance should reflect the transfer"
    );
  } else {
    console.log(
      "\n⏳ Swap not yet fulfilled - destination balance will increase once fulfilled"
    );
  }
}

async function main() {
  console.log("🚀 Starting local swap setup...\n");

  // Initialize wallet account
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("📝 Account address:", account.address);

  // Create public client for Chain 1 (source chain)
  const publicClient = createPublicClient({
    chain: LOCAL_CHAIN_1,
    transport: http("http://localhost:31337"),
  });

  // Create wallet client for Chain 1
  const walletClient = createWalletClient({
    chain: LOCAL_CHAIN_1,
    transport: http("http://localhost:31337"),
    account,
  });

  // Create the only swaps backend
  const backend = new ViemChainBackend(
    account.address,
    publicClient,
    walletClient
  );

  // Create the router client
  const router = new RouterClient({ routerAddress: ROUTER_ADDRESS }, backend);

  console.log("✅ Clients initialized");
  console.log("   Router address:", ROUTER_ADDRESS);
  console.log("   RUSD address:", RUSD_ADDRESS);
  console.log("   Source chain ID:", LOCAL_CHAIN_1.id);
  console.log("   Destination chain ID:", LOCAL_CHAIN_2.id);
  console.log("");

  // Mint tokens from faucet
  await mintFromFaucet(walletClient, account, RUSD_ADDRESS);
  console.log("");

  // Fetch recommended fees
  console.log("💰 Fetching recommended fees...");
  const feeRequest = {
    sourceToken: RUSD_ADDRESS,
    destinationToken: RUSD_ADDRESS, // Same address on both chains
    sourceChainId: BigInt(LOCAL_CHAIN_1.id),
    destinationChainId: BigInt(LOCAL_CHAIN_2.id),
    amount: 1000000000000000000n, // 1 RUSD (18 decimals)
  };

  const feeResponse = await fetchRecommendedFees(feeRequest);

  console.log("Recommended fees:", {
    solverFee: feeResponse.fees.solver.toString(),
    networkFee: feeResponse.fees.network.toString(),
    totalFee: feeResponse.fees.total.toString(),
    amountToTransfer: feeResponse.transferAmount.toString(),
    amountToApprove: feeResponse.approvalAmount.toString(),
  });
  console.log("");

  // Check token balance before swap
  console.log("💵 Checking token balance...");
  const balance = await checkBalance(
    publicClient,
    RUSD_ADDRESS,
    account.address
  );
  const requiredAmount = feeResponse.approvalAmount;
  console.log(`   Current balance: ${balance.toString()}`);
  console.log(`   Required amount: ${requiredAmount.toString()}`);

  if (balance < requiredAmount) {
    throw new Error(
      `Insufficient balance! Have ${balance.toString()}, need ${requiredAmount.toString()}`
    );
  }
  console.log("✅ Sufficient balance\n");

  // Execute swap
  console.log("🔄 Executing cross-chain swap...");
  try {
    const amount = 1000000000000000000n; // 1 RUSD
    const fee = feeResponse.fees.solver;

    // According to docs, SwapRequest doesn't include totalAmount - library calculates it
    const swapRequest = {
      recipient: account.address, // Send to self for testing
      srcToken: RUSD_ADDRESS,
      destToken: RUSD_ADDRESS,
      amount,
      fee,
      destChainId: BigInt(LOCAL_CHAIN_2.id),
    };

    console.log("Swap request details:", {
      recipient: swapRequest.recipient,
      srcToken: swapRequest.srcToken,
      destToken: swapRequest.destToken,
      amount: swapRequest.amount.toString(),
      fee: swapRequest.fee.toString(),
      destChainId: swapRequest.destChainId.toString(),
      totalNeeded: (amount + fee).toString(),
    });
    console.log("");

    const { requestId } = await router.swap(swapRequest);

    console.log("✅ Swap request submitted!");
    console.log("   Request ID:", requestId);
    console.log("");

    // Track swap status
    console.log("📊 Checking swap status...");
    const params = await router.fetchRequestParams(requestId);

    console.log("Swap parameters:", {
      sender: params.sender,
      recipient: params.recipient,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn.toString(),
      amountOut: params.amountOut.toString(),
      srcChainId: params.srcChainId.toString(),
      dstChainId: params.dstChainId.toString(),
      verificationFee: params.verificationFee.toString(),
      solverFee: params.solverFee.toString(),
      executed: params.executed,
      requestedAt: params.requestedAt.toString(),
    });
    console.log("");

    // Check initial fulfillment status using getFulfilledTransfers
    console.log("📋 Checking initial fulfillment status...");
    const isFulfilled = await isSwapFulfilled(
      requestId,
      ROUTER_ADDRESS,
      LOCAL_CHAIN_2.id
    );

    console.log("Initial fulfillment status:", {
      requestId,
      fulfilled: isFulfilled,
    });
    console.log("");

    // Check balances on both chains
    await checkBalancesOnBothChains(RUSD_ADDRESS, account.address, requestId);

    // Wait for fulfillment (optional - can be disabled for testing)
    if (!isFulfilled) {
      console.log("\n💡 Note: Swap request created successfully!");
      console.log(
        "   A solver will fulfill this swap on the destination chain."
      );
      console.log(
        "   You can check the status later using the request ID above.\n"
      );

      // Wait for fulfillment event
      const fulfilled = await waitForFulfillmentEvent(
        requestId,
        ROUTER_ADDRESS
      );

      if (fulfilled) {
        // Check balances again after fulfillment
        console.log("\n💰 Checking balances after fulfillment...");
        await checkBalancesOnBothChains(
          RUSD_ADDRESS,
          account.address,
          requestId
        );
      }
    } else {
      console.log("✅ Swap already fulfilled!");
    }
  } catch (error: any) {
    console.error("❌ Swap failed:", error);

    // Try to extract more error details
    if (error?.cause) {
      console.error("Error cause:", error.cause);
    }
    if (error?.message) {
      console.error("Error message:", error.message);
    }
    if (error?.data) {
      console.error("Error data:", error.data);
    }

    // Check if it's a contract revert
    if (error?.message?.includes("reverted")) {
      console.error("\n💡 Possible reasons for revert:");
      console.error(
        "   1. Router contract not configured for destination chain ID"
      );
      console.error("   2. Token addresses not supported by router");
      console.error("   3. Invalid fee amount");
      console.error("   4. Router contract state issue");
      console.error(
        "\n   Check your router contract configuration and ensure:"
      );
      console.error("   - Chain ID 31338 is registered in the router");
      console.error("   - RUSD token is whitelisted/supported");
      console.error("   - Router contract is properly initialized");
    }

    throw error;
  }
}

// Run the script
main()
  .then(() => {
    console.log("\n✨ Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
