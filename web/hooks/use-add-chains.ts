"use client"

import { useCallback } from "react"
import { useWalletClient } from "wagmi"
import { LOCAL_CHAIN_1, LOCAL_CHAIN_2 } from "@/lib/chains"

export function useAddChains() {
  const { data: walletClient } = useWalletClient()

  const addChains = useCallback(async () => {
    if (!walletClient) {
      throw new Error("Wallet not connected")
    }

    try {
      // Add Chain 1
      await walletClient.addChain({ chain: LOCAL_CHAIN_1 })
      
      // Add Chain 2
      await walletClient.addChain({ chain: LOCAL_CHAIN_2 })

      return true
    } catch (error: any) {
      // If chains already added, that's fine
      if (error?.message?.includes("already") || error?.message?.includes("exists")) {
        return true
      }
      throw error
    }
  }, [walletClient])

  return { addChains }
}

