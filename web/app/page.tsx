"use client"

import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64">
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          {/* Logo Grid Pattern */}
          <div className="mb-12 relative">
            <div className="flex flex-col items-center gap-1">
              {/* Top row */}
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
              </div>
              {/* Middle rows */}
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
              </div>
              {/* Bottom row */}
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
                <div className="w-3 h-3 bg-orange-500"></div>
              </div>
            </div>

            {/* Side elements */}
            <div className="absolute right-0 top-0 flex flex-col gap-1">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-orange-500"></div>
                <div className="w-2 h-2 bg-orange-500"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-orange-500"></div>
                <div className="w-2 h-2 bg-orange-500"></div>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-orange-500"></div>
                <div className="w-2 h-2 bg-orange-500"></div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <h1 className="text-7xl font-bold text-white mb-8 text-center">only</h1>

          <div className="max-w-2xl text-center mb-12">
            <p className="text-xl text-gray-400 mb-6">
              Your portal to the modular network for threshold signing and cross-chain coordination.
            </p>
            <p className="text-lg text-gray-500">No middlemen. No single point of trust. No BS.</p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 w-full max-w-md">
            <Link href="/swaps">
              <Button className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-7 text-lg">
                Swap tokens
              </Button>
            </Link>
            <Link href="/" className="text-center">
              <button className="text-white font-semibold hover:text-gray-300 transition-colors">Read the docs</button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
