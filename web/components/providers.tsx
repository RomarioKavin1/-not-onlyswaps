"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, createConfig, http } from "wagmi"
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit"
import { mainnet, sepolia, base, optimism, arbitrum } from "wagmi/chains"
import { LOCAL_CHAIN_1, LOCAL_CHAIN_2 } from "@/lib/chains"
import type { Config } from "wagmi"
import "@rainbow-me/rainbowkit/styles.css"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient()
  } else {
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}

// Singleton pattern to ensure config is only created once on client
let wagmiConfig: Config | null = null

// Create SSR-safe minimal config
function createSSRConfig(): Config {
  // Create a minimal config that works for SSR without connectors
  // This will be replaced with RainbowKit config on client
  return createConfig({
    chains: [LOCAL_CHAIN_1, LOCAL_CHAIN_2, mainnet, sepolia, base, optimism, arbitrum],
    connectors: [], // Empty connectors for SSR - will be replaced on client
    transports: {
      [LOCAL_CHAIN_1.id]: http(LOCAL_CHAIN_1.rpcUrls.default.http[0]),
      [LOCAL_CHAIN_2.id]: http(LOCAL_CHAIN_2.rpcUrls.default.http[0]),
      [mainnet.id]: http(),
      [sepolia.id]: http(),
      [base.id]: http(),
      [optimism.id]: http(),
      [arbitrum.id]: http(),
    },
    ssr: true,
  })
}

// Create RainbowKit config only on client side
function getRainbowKitConfig(): Config {
  if (typeof window === "undefined") {
    throw new Error("RainbowKit config should only be created on client side")
  }

  if (!wagmiConfig) {
    wagmiConfig = getDefaultConfig({
      appName: "ProofSwap",
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
      chains: [LOCAL_CHAIN_1, LOCAL_CHAIN_2, mainnet, sepolia, base, optimism, arbitrum],
      ssr: true,
    })
  }

  return wagmiConfig
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<Config>(() => {
    // Start with SSR-safe config
    return createSSRConfig()
  })
  const [mounted, setMounted] = React.useState(false)
  const queryClient = getQueryClient()

  React.useEffect(() => {
    // Upgrade to RainbowKit config on client side
    if (typeof window !== "undefined") {
      try {
        const rainbowConfig = getRainbowKitConfig()
        setConfig(rainbowConfig)
      } catch (error) {
        console.error("Failed to initialize RainbowKit config:", error)
        // Keep using SSR config if RainbowKit fails
      }
      setMounted(true)
    }
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {mounted ? (
          <RainbowKitProvider>
            {children}
          </RainbowKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

