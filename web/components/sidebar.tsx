"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sun, Moon, Monitor, Settings, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function Sidebar() {
  const pathname = usePathname()
  const [showThemeMenu, setShowThemeMenu] = useState(false)

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-black border-r border-gray-800 flex flex-col p-6">
      {/* Logo/Brand */}
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 bg-gradient-to-br from-orange-500 to-orange-400 transform -rotate-45"></div>
          <span className="text-white font-bold text-lg">swaps</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-br from-orange-500 to-orange-400 transform -rotate-45"></div>
          <span className="text-white font-bold text-lg">policies</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="space-y-4 flex-1">
        <Link
          href="/swaps"
          className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
            pathname === "/swaps" ? "text-orange-500" : "text-gray-400 hover:text-white"
          }`}
        >
          <div className="w-4 h-4 border-2 border-current transform -rotate-45"></div>
          <span>swaps</span>
        </Link>
        <Link
          href="/policies"
          className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
            pathname === "/policies" ? "text-orange-500" : "text-gray-400 hover:text-white"
          }`}
        >
          <div className="w-4 h-4 border-2 border-current transform -rotate-45"></div>
          <span>policies</span>
        </Link>
      </nav>

      {/* Version */}
      <div className="mb-8">
        <div className="text-gray-600 text-sm px-4 py-2">Version 0.1.0</div>
      </div>

      {/* Theme toggles */}
      <div className="flex gap-2 mb-6 px-4">
        <button className="p-2 hover:text-orange-500 text-gray-400 transition-colors">
          <Sun className="w-4 h-4" />
        </button>
        <button className="p-2 hover:text-orange-500 text-gray-400 transition-colors">
          <Moon className="w-4 h-4" />
        </button>
        <button className="p-2 hover:text-orange-500 text-gray-400 transition-colors">
          <Monitor className="w-4 h-4" />
        </button>
      </div>

      {/* Settings and Close */}
      <div className="space-y-3 mb-6 border-t border-gray-800 pt-4">
        <button className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Close</span>
        </button>
      </div>

      {/* Connect Wallet Button */}
      <Button className="w-full bg-orange-500 hover:bg-orange-600 text-black font-semibold py-6">
        📱 Connect wallet
      </Button>

      {/* Footer */}
      <div className="text-center text-gray-600 text-xs mt-6 pt-6 border-t border-gray-800">
        <p>Powered by</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          <div className="w-3 h-3 bg-white transform -rotate-45"></div>
          <span>daipher</span>
        </div>
      </div>
    </div>
  )
}
