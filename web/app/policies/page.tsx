"use client"

import { Sidebar } from "@/components/sidebar"

export default function PoliciesPage() {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-12">
        {/* Header */}
        <div className="mb-32">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-4 h-4 bg-orange-500 transform -rotate-45"></div>
            <h1 className="text-4xl font-bold text-white">only policies</h1>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-2xl">
          <div className="bg-gray-900/30 rounded-lg p-12 border border-gray-800 text-center">
            <div className="text-gray-500 text-sm mb-8 uppercase tracking-wider">
              DEFINE THE CONDITIONS YOU WANT TO TRIGGER YOUR FUNDS TO MOVE.
            </div>
            <button className="inline-block bg-gray-800 text-gray-500 px-6 py-3 rounded text-sm font-semibold hover:bg-gray-700 transition-colors">
              COMING SOON
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
