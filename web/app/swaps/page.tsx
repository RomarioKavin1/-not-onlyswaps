"use client"

import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

export default function SwapsPage() {
  const [showNetwork, setShowNetwork] = useState(false)
  const [showDestination, setShowDestination] = useState(false)

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-12">
        {/* Header */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-4 h-4 bg-orange-500 transform -rotate-45"></div>
            <h1 className="text-4xl font-bold text-white">only swaps</h1>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl">
          {/* Amount Display Section */}
          <div className="mb-16 bg-gray-900/30 rounded-lg p-8 border border-gray-800">
            <div className="text-gray-600 text-sm mb-4">💰 TOTAL TO MOVE</div>
            <div className="text-6xl font-bold text-orange-500 mb-2">0000.00 USDT</div>
            <div className="text-gray-500 text-sm mb-6">~ 0.00 USD</div>
            <div className="text-orange-500 font-semibold text-sm mb-8">CONNECT YOUR WALLET TO START</div>

            {/* Details Section */}
            <div className="space-y-3 border-t border-gray-800 pt-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Network fees</span>
                <span className="text-gray-500">−</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Destination will receive</span>
                <span className="text-gray-500">−</span>
              </div>
            </div>

            <Button className="mt-8 bg-orange-500 hover:bg-orange-600 text-black font-semibold px-8">
              Review & Sign
            </Button>
          </div>

          {/* Swap Interface */}
          <div className="grid grid-cols-2 gap-8 mb-12">
            {/* FROM */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-gray-500 text-sm">⬆️ FROM</span>
              </div>
              <button className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-gray-400 hover:border-gray-700 transition-colors flex items-center justify-between">
                <span>Select a source</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* TO */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-gray-500 text-sm">⬇️ TO</span>
              </div>
              <button className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-gray-400 hover:border-gray-700 transition-colors flex items-center justify-between">
                <span>Select a destination</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Coming Soon Section */}
          <div className="bg-gray-900/30 rounded-lg p-8 border border-gray-800 text-center">
            <div className="text-gray-500 text-sm mb-4">
              ADD MULTIPLE SOURCES AND DESTINATIONS TO SUPPORT COMPLEX SWAPS.
            </div>
            <div className="inline-block bg-gray-800 text-gray-500 px-4 py-2 rounded text-sm font-semibold">
              COMING SOON
            </div>
          </div>

          {/* Learn More Link */}
          <div className="mt-8 text-center">
            <a href="#" className="text-orange-500 hover:text-orange-400 text-sm font-semibold transition-colors">
              Learn more about swaps
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
