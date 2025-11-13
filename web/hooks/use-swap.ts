"use client"

import { useState, useEffect, useCallback } from "react"
import { useAccount, useWalletClient, usePublicClient, useChainId, useSwitchChain } from "wagmi"
import { createPublicClient, createWalletClient, http, custom, type Address } from "viem"
import { RouterClient, ViemChainBackend } from "onlyswaps-js"
import {
  LOCAL_CHAIN_1,
  LOCAL_CHAIN_2,
  ROUTER_ADDRESS,
  RUSD_ADDRESS,
} from "@/lib/chains"
import {
  checkBalancesOnBothChains,
  fetchRecommendedFees,
  isSwapFulfilled,
  formatTokenAmount,
  parseTokenAmount,
} from "@/lib/swap-utils"
import { ERC20_ABI } from "@/lib/swap-utils"

export interface SwapFees {
  solver: bigint
  network: bigint
  total: bigint
}

export interface SwapState {
  balances: {
    chain1: bigint
    chain2: bigint
  } | null
  fees: SwapFees | null
  swapRequestId: `0x${string}` | null
  isFulfilled: boolean
  isLoading: boolean
  error: string | null
}

export function useSwap() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [state, setState] = useState<SwapState>({
    balances: null,
    fees: null,
    swapRequestId: null,
    isFulfilled: false,
    isLoading: false,
    error: null,
  })

  // Load balances
  const loadBalances = useCallback(async () => {
    if (!address) return

    try {
      const balances = await checkBalancesOnBothChains(RUSD_ADDRESS, address)
      setState((prev) => ({ ...prev, balances }))
    } catch (error) {
      console.error("Error loading balances:", error)
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to load balances",
      }))
    }
  }, [address])

  // Mint from faucet
  const mintFromFaucet = useCallback(async () => {
    if (!address || !walletClient) {
      throw new Error("Wallet not connected")
    }

    // Ensure we're on chain 1
    if (chainId !== LOCAL_CHAIN_1.id) {
      await switchChain({ chainId: LOCAL_CHAIN_1.id })
      // Wait a bit for chain switch
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      // Create wallet client for chain 1
      const chain1WalletClient = createWalletClient({
        chain: LOCAL_CHAIN_1,
        transport: custom(walletClient.transport),
        account: address as Address,
      })

      const hash = await chain1WalletClient.writeContract({
        address: RUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [],
      })

      // Wait for transaction
      const chain1PublicClient = createPublicClient({
        chain: LOCAL_CHAIN_1,
        transport: http(LOCAL_CHAIN_1.rpcUrls.default.http[0]),
      })

      await chain1PublicClient.waitForTransactionReceipt({ hash })

      // Reload balances
      await loadBalances()

      setState((prev) => ({ ...prev, isLoading: false }))
      return hash
    } catch (error: any) {
      const errorMessage =
        error?.message?.includes("Wait 24h")
          ? "Faucet cooldown active, but you may already have tokens"
          : error?.message || "Failed to mint tokens"
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }))
      throw error
    }
  }, [address, walletClient, chainId, switchChain, loadBalances])

  // Fetch fees
  const fetchFees = useCallback(
    async (amount: string) => {
      if (!amount || parseFloat(amount) <= 0) {
        setState((prev) => ({ ...prev, fees: null }))
        return
      }

      try {
        const amountBigInt = parseTokenAmount(amount)
        const feeResponse = await fetchRecommendedFees({
          sourceToken: RUSD_ADDRESS,
          destinationToken: RUSD_ADDRESS,
          sourceChainId: BigInt(LOCAL_CHAIN_1.id),
          destinationChainId: BigInt(LOCAL_CHAIN_2.id),
          amount: amountBigInt,
        })

        setState((prev) => ({
          ...prev,
          fees: feeResponse.fees,
        }))
      } catch (error) {
        console.error("Error fetching fees:", error)
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to fetch fees",
        }))
      }
    },
    []
  )

  // Execute swap
  const executeSwap = useCallback(
    async (amount: string) => {
      if (!address || !walletClient || !publicClient) {
        throw new Error("Wallet not connected")
      }

      // Ensure we're on chain 1
      if (chainId !== LOCAL_CHAIN_1.id) {
        await switchChain({ chainId: LOCAL_CHAIN_1.id })
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        const amountBigInt = parseTokenAmount(amount)
        const feeResponse = await fetchRecommendedFees({
          sourceToken: RUSD_ADDRESS,
          destinationToken: RUSD_ADDRESS,
          sourceChainId: BigInt(LOCAL_CHAIN_1.id),
          destinationChainId: BigInt(LOCAL_CHAIN_2.id),
          amount: amountBigInt,
        })

        // Create clients for chain 1
        const chain1PublicClient = createPublicClient({
          chain: LOCAL_CHAIN_1,
          transport: http(LOCAL_CHAIN_1.rpcUrls.default.http[0]),
        })

        // Create wallet client wrapper for the backend
        // The backend needs a wallet client, so we create one from the wagmi walletClient
        const chain1WalletClient = createWalletClient({
          chain: LOCAL_CHAIN_1,
          transport: custom(walletClient.transport),
          account: address as Address,
        })

        // Create backend and router client
        const backend = new ViemChainBackend(
          address,
          chain1PublicClient,
          chain1WalletClient
        )

        const router = new RouterClient({ routerAddress: ROUTER_ADDRESS }, backend)

        // Execute swap
        const swapRequest = {
          recipient: address,
          srcToken: RUSD_ADDRESS,
          destToken: RUSD_ADDRESS,
          amount: amountBigInt,
          fee: feeResponse.fees.solver,
          destChainId: BigInt(LOCAL_CHAIN_2.id),
        }

        const { requestId } = await router.swap(swapRequest)

        // Check fulfillment status
        const fulfilled = await isSwapFulfilled(
          requestId,
          ROUTER_ADDRESS,
          LOCAL_CHAIN_2.id
        )

        // Reload balances
        await loadBalances()

        setState((prev) => ({
          ...prev,
          swapRequestId: requestId,
          isFulfilled: fulfilled,
          isLoading: false,
        }))

        return requestId
      } catch (error: any) {
        const errorMessage = error?.message || "Failed to execute swap"
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }))
        throw error
      }
    },
    [address, walletClient, publicClient, chainId, switchChain, loadBalances]
  )

  // Check swap status
  const checkSwapStatus = useCallback(
    async (requestId: `0x${string}`) => {
      if (!requestId) return

      try {
        const fulfilled = await isSwapFulfilled(
          requestId,
          ROUTER_ADDRESS,
          LOCAL_CHAIN_2.id
        )

        if (fulfilled) {
          await loadBalances()
        }

        setState((prev) => ({
          ...prev,
          isFulfilled: fulfilled,
        }))

        return fulfilled
      } catch (error) {
        console.error("Error checking swap status:", error)
      }
    },
    [loadBalances]
  )

  // Load balances when address changes
  useEffect(() => {
    if (isConnected && address) {
      loadBalances()
    }
  }, [isConnected, address, loadBalances])

  return {
    ...state,
    loadBalances,
    mintFromFaucet,
    fetchFees,
    executeSwap,
    checkSwapStatus,
    formatTokenAmount,
  }
}

