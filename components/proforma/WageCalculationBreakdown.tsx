"use client";

import { WageCalculationBreakdown } from "@/lib/labor-rate-calculator";
import { useState } from "react";

interface WageCalculationBreakdownProps {
  breakdown: WageCalculationBreakdown;
  positionName?: string;
}

export function WageCalculationBreakdownUI({
  breakdown,
  positionName,
}: WageCalculationBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative">
      {/* Final Rate Display with Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-sm text-zinc-700 hover:text-zinc-900 hover:underline focus:outline-none"
        type="button"
      >
        ${breakdown.final_rate.toFixed(2)}/hr
        <span className="ml-1 text-xs text-zinc-500">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>

      {/* Calculation Breakdown Popover */}
      {isExpanded && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-zinc-300 rounded-lg shadow-xl p-4 min-w-[400px] max-w-[500px]">
          {/* Header */}
          <div className="flex items-start justify-between mb-3 pb-2 border-b border-zinc-200">
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                {positionName || "Position"} Wage Calculation
              </div>
              <div className="text-xs text-zinc-600 mt-0.5">
                {breakdown.is_tipped ? "Tipped Position" : "Non-Tipped Position"}
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-zinc-500 hover:text-zinc-700 text-lg leading-none"
              type="button"
            >
              ×
            </button>
          </div>

          {/* Input Parameters */}
          <div className="mb-3 bg-zinc-50 rounded p-3 text-xs">
            <div className="font-medium text-zinc-700 mb-1.5">Input Parameters:</div>
            <div className="space-y-1 text-zinc-600">
              <div className="flex justify-between">
                <span>City Min Wage:</span>
                <span className="font-mono">${breakdown.min_wage.toFixed(2)}</span>
              </div>
              {breakdown.is_tipped && breakdown.tip_credit !== undefined && (
                <div className="flex justify-between">
                  <span>Tip Credit:</span>
                  <span className="font-mono">${breakdown.tip_credit.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Position Multiplier:</span>
                <span className="font-mono">{breakdown.position_multiplier.toFixed(2)}×</span>
              </div>
              <div className="flex justify-between">
                <span>Market Tier:</span>
                <span className="font-medium">{breakdown.market_tier}</span>
              </div>
              <div className="flex justify-between">
                <span>Tier Multiplier:</span>
                <span className="font-mono">{breakdown.tier_multiplier.toFixed(2)}×</span>
              </div>
            </div>
          </div>

          {/* Calculation Steps */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-700 mb-1">Calculation Steps:</div>
            {breakdown.calculation_steps.map((step) => (
              <div
                key={step.step}
                className="bg-blue-50/50 border border-blue-200 rounded p-2.5 text-xs"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-semibold">
                      {step.step}
                    </span>
                    <span className="font-medium text-zinc-900">{step.description}</span>
                  </div>
                  <span className="font-mono font-semibold text-blue-900">
                    = ${step.value.toFixed(2)}
                  </span>
                </div>
                <div className="pl-7 font-mono text-xs text-zinc-600 bg-white rounded px-2 py-1 mt-1">
                  {step.formula}
                </div>
              </div>
            ))}
          </div>

          {/* Final Result */}
          <div className="mt-3 pt-3 border-t border-zinc-200">
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded p-3">
              <span className="text-sm font-semibold text-emerald-900">Final Hourly Rate:</span>
              <span className="text-lg font-bold text-emerald-900 font-mono">
                ${breakdown.final_rate.toFixed(2)}/hr
              </span>
            </div>
          </div>

          {/* Additional Info */}
          {breakdown.is_tipped && breakdown.tipped_floor_pct && (
            <div className="mt-2 text-xs text-zinc-500 italic">
              * Tipped positions have a {(breakdown.tipped_floor_pct * 100).toFixed(0)}% minimum
              wage floor to ensure fair compensation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
