"use client"

import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAccount, useChainId, useSwitchChain } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useState, useEffect } from "react"
import { useSwap } from "@/hooks/use-swap"
import { useAddChains } from "@/hooks/use-add-chains"
import { LOCAL_CHAIN_1, LOCAL_CHAIN_2, ROUTER_ADDRESS, RUSD_ADDRESS } from "@/lib/chains"
import { formatTokenAmount, parseTokenAmount } from "@/lib/swap-utils"
import { Copy, Check, RefreshCw, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function SwapsPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { addChains } = useAddChains()
  const {
    balances,
    fees,
    swapRequestId,
    isFulfilled,
    isLoading,
    error,
    loadBalances,
    mintFromFaucet,
    fetchFees,
    executeSwap,
    checkSwapStatus,
    formatTokenAmount: formatAmount,
  } = useSwap()

  const [amount, setAmount] = useState("")
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [addingChains, setAddingChains] = useState(false)

  // Fetch fees when amount changes
  useEffect(() => {
    if (amount && parseFloat(amount) > 0) {
      const timeoutId = setTimeout(() => {
        fetchFees(amount)
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [amount, fetchFees])

  // Poll for swap status if there's a pending swap
  useEffect(() => {
    if (swapRequestId && !isFulfilled) {
      const interval = setInterval(() => {
        checkSwapStatus(swapRequestId)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [swapRequestId, isFulfilled, checkSwapStatus])

  const handleAddChains = async () => {
    setAddingChains(true)
    try {
      await addChains()
      toast.success("Chains added successfully!")
    } catch (error: any) {
      toast.error(error?.message || "Failed to add chains")
    } finally {
      setAddingChains(false)
    }
  }

  const handleMint = async () => {
    try {
      await mintFromFaucet()
      toast.success("Tokens minted successfully!")
    } catch (error: any) {
      toast.error(error?.message || "Failed to mint tokens")
    }
  }

  const handleSwap = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    try {
      const requestId = await executeSwap(amount)
      toast.success(`Swap initiated! Request ID: ${requestId.slice(0, 10)}...`)
    } catch (error: any) {
      toast.error(error?.message || "Failed to execute swap")
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedAddress(label)
    toast.success("Copied to clipboard!")
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const totalAmount = fees
    ? parseFloat(amount) + parseFloat(formatAmount(fees.total, 18))
    : parseFloat(amount) || 0

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-4 h-4 bg-orange-500 transform -rotate-45"></div>
            <h1 className="text-4xl font-bold text-white">only swaps</h1>
          </div>

          {/* Contract Addresses */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
              <div className="text-gray-500 text-xs mb-2">Router Address</div>
              <div className="flex items-center gap-2">
                <code className="text-sm text-gray-300 font-mono">
                  {ROUTER_ADDRESS.slice(0, 10)}...{ROUTER_ADDRESS.slice(-8)}
                </code>
                <button
                  onClick={() => copyToClipboard(ROUTER_ADDRESS, "router")}
                  className="text-gray-500 hover:text-orange-500 transition-colors"
                >
                  {copiedAddress === "router" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
              <div className="text-gray-500 text-xs mb-2">RUSD Address</div>
              <div className="flex items-center gap-2">
                <code className="text-sm text-gray-300 font-mono">
                  {RUSD_ADDRESS.slice(0, 10)}...{RUSD_ADDRESS.slice(-8)}
                </code>
                <button
                  onClick={() => copyToClipboard(RUSD_ADDRESS, "rusd")}
                  className="text-gray-500 hover:text-orange-500 transition-colors"
                >
                  {copiedAddress === "rusd" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Chain Setup */}
          {isConnected && (
            <div className="mb-6">
              <Button
                onClick={handleAddChains}
                disabled={addingChains}
                variant="outline"
                className="border-gray-800 text-gray-300 hover:bg-gray-900"
              >
                {addingChains ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding Chains...
                  </>
                ) : (
                  "➕ Add Chains to Wallet"
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Wallet Connection */}
        {!isConnected && (
          <div className="max-w-4xl mb-8">
            <div className="bg-gray-900/30 rounded-lg p-8 border border-gray-800 text-center">
              <div className="text-gray-500 text-sm mb-4">CONNECT YOUR WALLET TO START</div>
              <ConnectButton />
            </div>
          </div>
        )}

        {isConnected && (
          <div className="max-w-4xl">
            {/* Balances Section */}
            <div className="mb-8 bg-gray-900/30 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Token Balances</h2>
                <button
                  onClick={loadBalances}
                  disabled={isLoading}
                  className="text-gray-500 hover:text-orange-500 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-500 text-sm mb-1">Chain {LOCAL_CHAIN_1.id}</div>
                  <div className="text-2xl font-bold text-orange-500">
                    {balances
                      ? formatAmount(balances.chain1, 18)
                      : isLoading
                      ? "..."
                      : "0.00"}{" "}
                    RUSD
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm mb-1">Chain {LOCAL_CHAIN_2.id}</div>
                  <div className="text-2xl font-bold text-orange-500">
                    {balances
                      ? formatAmount(balances.chain2, 18)
                      : isLoading
                      ? "..."
                      : "0.00"}{" "}
                    RUSD
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800">
                <Button
                  onClick={handleMint}
                  disabled={isLoading || chainId !== LOCAL_CHAIN_1.id}
                  variant="outline"
                  className="w-full border-gray-800 text-gray-300 hover:bg-gray-900"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Minting...
                    </>
                  ) : chainId !== LOCAL_CHAIN_1.id ? (
                    `Switch to Chain ${LOCAL_CHAIN_1.id} to Mint`
                  ) : (
                    "🚰 Mint from Faucet"
                  )}
                </Button>
              </div>
            </div>

            {/* Swap Interface */}
            <div className="mb-8 bg-gray-900/30 rounded-lg p-8 border border-gray-800">
              <div className="text-gray-600 text-sm mb-4">💰 AMOUNT TO SWAP</div>
              <div className="mb-6">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-black border-gray-800 text-white text-4xl font-bold h-20 px-6"
                  step="0.01"
                  min="0"
                />
                <div className="text-gray-500 text-sm mt-2">RUSD</div>
              </div>

              {/* Fees Display */}
              {fees && parseFloat(amount) > 0 && (
                <div className="space-y-3 border-t border-gray-800 pt-6 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Solver fee</span>
                    <span className="text-gray-300">
                      {formatAmount(fees.solver, 18)} RUSD
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Network fee</span>
                    <span className="text-gray-300">
                      {formatAmount(fees.network, 18)} RUSD
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-gray-800">
                    <span className="text-gray-300 font-semibold">Total</span>
                    <span className="text-orange-500 font-bold text-lg">
                      {totalAmount.toFixed(4)} RUSD
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Destination will receive</span>
                    <span className="text-gray-300 font-semibold">{amount} RUSD</span>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Swap Status */}
              {swapRequestId && (
                <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                  <div className="text-gray-400 text-sm mb-2">Swap Status</div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isFulfilled ? "bg-green-500" : "bg-yellow-500 animate-pulse"
                      }`}
                    />
                    <span className="text-white font-semibold">
                      {isFulfilled ? "Fulfilled" : "Pending"}
                    </span>
                  </div>
                  <div className="text-gray-500 text-xs font-mono break-all">
                    Request ID: {swapRequestId}
                  </div>
                </div>
              )}

              {/* Execute Swap Button */}
              <Button
                onClick={handleSwap}
                disabled={
                  isLoading ||
                  !amount ||
                  parseFloat(amount) <= 0 ||
                  chainId !== LOCAL_CHAIN_1.id ||
                  (balances && fees && balances.chain1 < parseTokenAmount(amount, 18) + fees.total)
                }
                className="w-full bg-orange-500 hover:bg-orange-600 text-black font-semibold py-6 text-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : chainId !== LOCAL_CHAIN_1.id ? (
                  `Switch to Chain ${LOCAL_CHAIN_1.id} to Swap`
                ) : balances && fees && balances.chain1 < parseTokenAmount(amount, 18) + fees.total ? (
                  "Insufficient Balance"
                ) : (
                  "Review & Sign"
                )}
              </Button>
            </div>

            {/* Chain Info */}
            <div className="bg-gray-900/30 rounded-lg p-6 border border-gray-800">
              <div className="text-gray-500 text-sm mb-4">Chain Configuration</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 mb-1">Source Chain</div>
                  <div className="text-white font-semibold">
                    {LOCAL_CHAIN_1.name} (ID: {LOCAL_CHAIN_1.id})
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Destination Chain</div>
                  <div className="text-white font-semibold">
                    {LOCAL_CHAIN_2.name} (ID: {LOCAL_CHAIN_2.id})
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
