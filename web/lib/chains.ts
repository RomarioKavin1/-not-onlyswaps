import { defineChain, type Chain } from "viem"

// Local chain configuration matching swap.ts
export const LOCAL_CHAIN_1 = defineChain({
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
      http: ["https://blue.crevn.xyz"],
    },
    public: {
      http: ["https://blue.crevn.xyz"],
    },
  },
})

export const LOCAL_CHAIN_2 = defineChain({
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
      http: ["https://green.crevn.xyz"],
    },
    public: {
      http: ["https://green.crevn.xyz"],
    },
  },
})

export const LOCAL_CHAINS: Chain[] = [LOCAL_CHAIN_1, LOCAL_CHAIN_2]

// Local deployment addresses
export const ROUTER_ADDRESS = "0xa504fbff16352e397e3bc1459a284c4426c55787" as const
export const RUSD_ADDRESS = "0x6b0fb8117c30b5ae16db76ab7a1f2bde9f7ed61b" as const

// Fee API configuration
export const FEE_API_URL = "https://red.crevn.xyz"

