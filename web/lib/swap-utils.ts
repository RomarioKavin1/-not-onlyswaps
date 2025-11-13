import { createPublicClient, http, type Address, type Chain } from "viem"
import { LOCAL_CHAIN_1, LOCAL_CHAIN_2, RUSD_ADDRESS, FEE_API_URL } from "./chains"

// ERC20 ABI for balance checking and minting
export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const

// Router ABI for checking fulfilled transfers
export const ROUTER_ABI = [
  {
    name: "getFulfilledTransfers",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
] as const

/**
 * Check token balance for an address
 */
export async function checkBalance(
  chain: Chain,
  tokenAddress: Address,
  userAddress: Address
): Promise<bigint> {
  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    })

    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    })
    return balance as bigint
  } catch (error) {
    console.error("Error checking balance:", error)
    return 0n
  }
}

/**
 * Check balances on both chains
 */
export async function checkBalancesOnBothChains(
  tokenAddress: Address,
  userAddress: Address
): Promise<{ chain1: bigint; chain2: bigint }> {
  const [chain1Balance, chain2Balance] = await Promise.all([
    checkBalance(LOCAL_CHAIN_1, tokenAddress, userAddress),
    checkBalance(LOCAL_CHAIN_2, tokenAddress, userAddress),
  ])

  return {
    chain1: chain1Balance,
    chain2: chain2Balance,
  }
}

/**
 * Check if a swap request is fulfilled
 */
export async function isSwapFulfilled(
  requestId: `0x${string}`,
  routerAddress: Address,
  chainId: number
): Promise<boolean> {
  const chain = chainId === 31337 ? LOCAL_CHAIN_1 : LOCAL_CHAIN_2
  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  })

  try {
    const fulfilledIds = (await publicClient.readContract({
      address: routerAddress,
      abi: ROUTER_ABI,
      functionName: "getFulfilledTransfers",
    })) as `0x${string}`[]

    return fulfilledIds.includes(requestId)
  } catch (error) {
    console.error("Error checking fulfilled transfers:", error)
    return false
  }
}

/**
 * Fetch recommended fees from local solver API or use manual values
 */
export async function fetchRecommendedFees(params: {
  sourceToken: string
  destinationToken: string
  sourceChainId: bigint
  destinationChainId: bigint
  amount: bigint
}) {
  try {
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
    })

    if (response.ok) {
      const data = (await response.json()) as {
        fees?: {
          solver?: string | number
          network?: string | number
          total?: string | number
        }
        transferAmount?: string | number
        approvalAmount?: string | number
      }
      return {
        fees: {
          solver: BigInt(data.fees?.solver || "10000000000000000"), // 0.01 RUSD default
          network: BigInt(data.fees?.network || "0"),
          total: BigInt(data.fees?.total || "10000000000000000"),
        },
        transferAmount: BigInt(data.transferAmount || params.amount.toString()),
        approvalAmount: BigInt(data.approvalAmount || params.amount.toString()),
      }
    }
  } catch (error) {
    console.warn("Failed to fetch fees from API, using manual values:", error)
  }

  // Fallback to manual fee calculation
  const solverFee = 10000000000000000n // 0.01 RUSD
  const networkFee = 0n
  const totalFee = solverFee + networkFee

  return {
    fees: {
      solver: solverFee,
      network: networkFee,
      total: totalFee,
    },
    transferAmount: params.amount,
    approvalAmount: params.amount + totalFee,
  }
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals)
  const whole = amount / divisor
  const fraction = amount % divisor
  const fractionStr = fraction.toString().padStart(decimals, "0")
  const trimmedFraction = fractionStr.replace(/0+$/, "") || "0"
  return `${whole.toString()}.${trimmedFraction}`
}

/**
 * Parse token amount from string input
 */
export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  const [whole, fraction = ""] = amount.split(".")
  const wholePart = BigInt(whole || "0")
  const fractionPart = BigInt((fraction.padEnd(decimals, "0").slice(0, decimals) || "0"))
  const divisor = BigInt(10 ** decimals)
  return wholePart * divisor + fractionPart
}

