"use client"

import { Sidebar } from "@/components/sidebar"
import { Check, X } from "lucide-react"

export default function WhyUsPage() {
  const features = [
    {
      feature: "Balance Check",
      v1: true,
      v2: true,
      v2Note: "Enhanced"
    },
    {
      feature: "Fee Check",
      v1: true,
      v2: true,
      v2Note: "Enhanced (min threshold)"
    },
    {
      feature: "Conditional Execution",
      v1: false,
      v2: true,
      v2Note: "Price, time, balance, custom"
    },
    {
      feature: "Risk Management",
      v1: false,
      v2: true,
      v2Note: "4 risk types assessed"
    },
    {
      feature: "Profit Optimization",
      v1: false,
      v2: true,
      v2Note: "Gas + opportunity cost"
    },
    {
      feature: "Trade Ranking",
      v1: false,
      v2: true,
      v2Note: "By profitability score"
    },
    {
      feature: "Price Oracle",
      v1: false,
      v2: true,
      v2Note: "With caching"
    },
    {
      feature: "Gas Estimation",
      v1: false,
      v2: true,
      v2Note: "Per-chain estimates"
    },
    {
      feature: "Execution Order",
      v1: "First found",
      v2: "Best score first",
      v2Note: ""
    }
  ]

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-64 p-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-4 h-4 bg-orange-500 transform -rotate-45"></div>
            <h1 className="text-4xl font-bold text-white">Why Solver V2?</h1>
          </div>
          <p className="text-gray-400 text-lg max-w-2xl">
            Compare Solver V1 and V2 to see how our enhanced solver provides better trade selection, 
            risk management, and profit optimization.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="max-w-5xl">
          <div className="bg-gray-900/30 rounded-lg border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-6 text-gray-400 font-semibold uppercase text-sm tracking-wider">
                      Feature
                    </th>
                    <th className="text-center p-6 text-gray-400 font-semibold uppercase text-sm tracking-wider">
                      Solver V1
                    </th>
                    <th className="text-center p-6 text-gray-400 font-semibold uppercase text-sm tracking-wider">
                      Solver V2
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((item, index) => (
                    <tr 
                      key={index}
                      className="border-b border-gray-800/50 hover:bg-gray-900/20 transition-colors"
                    >
                      <td className="p-6">
                        <div className="text-white font-medium">{item.feature}</div>
                        {item.v2Note && (
                          <div className="text-gray-500 text-sm mt-1">{item.v2Note}</div>
                        )}
                      </td>
                      <td className="p-6 text-center">
                        {typeof item.v1 === 'boolean' ? (
                          item.v1 ? (
                            <Check className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-gray-600 mx-auto" />
                          )
                        ) : (
                          <span className="text-gray-400 text-sm">{item.v1}</span>
                        )}
                      </td>
                      <td className="p-6 text-center">
                        {typeof item.v2 === 'boolean' ? (
                          item.v2 ? (
                            <div className="flex flex-col items-center gap-1">
                              <Check className="w-5 h-5 text-orange-500 mx-auto" />
                              {item.v2Note && (
                                <span className="text-xs text-gray-500">{item.v2Note}</span>
                              )}
                            </div>
                          ) : (
                            <X className="w-5 h-5 text-gray-600 mx-auto" />
                          )
                        ) : (
                          <span className="text-orange-500 font-medium">{item.v2}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Additional Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="bg-gray-900/30 rounded-lg p-6 border border-gray-800">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500"></div>
                Solver V1
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Simple, fast, and predictable. Perfect for basic swaps with minimal overhead. 
                Executes trades in order found with basic balance and fee checks.
              </p>
              <div className="mt-4 text-xs text-gray-500">
                ~200 lines • ~1-5ms per transfer
              </div>
            </div>

            <div className="bg-gray-900/30 rounded-lg p-6 border border-orange-500/30">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500"></div>
                Solver V2
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Enhanced with conditional execution and intelligent optimization. Maximizes profit 
                through risk management, smart scoring, and trade ranking. Perfect for production use.
              </p>
              <div className="mt-4 text-xs text-gray-500">
                ~750 lines • ~10-50ms per transfer
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mt-8 bg-gray-900/30 rounded-lg p-8 border border-gray-800">
            <h3 className="text-white font-semibold mb-6 text-xl">When to Use Which?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-orange-500 font-medium mb-3">Use Solver V1 when:</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You want simple, predictable behavior</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You don't need conditions or optimization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You want minimal overhead</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You're testing/debugging</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-orange-500 font-medium mb-3">Use Solver V2 when:</h4>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You want to maximize profit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You need conditional execution (limit orders, scheduled swaps)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You want risk protection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-600">•</span>
                    <span>You're running in production</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

