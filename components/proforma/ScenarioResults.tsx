"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calculator, Download, Sparkles, Loader2 } from "lucide-react";

interface ScenarioResultsProps {
  scenario: any;
  project: any;
}

export function ScenarioResults({ scenario, project }: ScenarioResultsProps) {
  const [calculating, setCalculating] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [loadingNarrative, setLoadingNarrative] = useState(false);

  const hasAllAssumptions =
    scenario.proforma_revenue_assumptions?.length > 0 &&
    scenario.proforma_cogs_assumptions?.length > 0 &&
    scenario.proforma_labor_assumptions?.length > 0 &&
    scenario.proforma_occupancy_opex_assumptions?.length > 0 &&
    scenario.proforma_capex_assumptions?.length > 0;

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const response = await fetch("/api/proforma/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenario.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to calculate");
      }

      const data = await response.json();
      setSummary(data.summary);
      alert("Proforma calculated successfully!");
      window.location.reload();
    } catch (error) {
      console.error("Error calculating:", error);
      alert("Failed to calculate proforma");
    } finally {
      setCalculating(false);
    }
  };

  const handleExplain = async () => {
    setLoadingNarrative(true);
    try {
      const response = await fetch("/api/proforma/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenario.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate narrative");
      }

      const data = await response.json();
      setNarrative(data.narrative);
    } catch (error) {
      console.error("Error generating narrative:", error);
      alert("Failed to generate narrative");
    } finally {
      setLoadingNarrative(false);
    }
  };

  // Calculate implied metrics
  const totalSqft = (project.square_feet_foh || 0) + (project.square_feet_boh || 0);
  const revenuePerSeat = summary?.year1Revenue && project.seats
    ? summary.year1Revenue / project.seats
    : null;
  const revenuePerSqft = summary?.year1Revenue && totalSqft
    ? summary.year1Revenue / totalSqft
    : null;

  const opex = scenario.proforma_occupancy_opex_assumptions?.[0];
  const rentPct = summary?.year1Revenue && opex?.base_rent_monthly
    ? ((opex.base_rent_monthly * 12) / summary.year1Revenue) * 100
    : null;

  if (!hasAllAssumptions) {
    return (
      <Card className="p-8">
        <div className="text-center">
          <Calculator className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-zinc-300 mb-2">
            Missing Assumptions
          </h3>
          <p className="text-sm text-zinc-500 mb-4">
            Complete all assumption tabs (Revenue, COGS, Labor, OpEx, CapEx) before
            calculating results
          </p>
          <div className="text-sm text-zinc-400">
            {!scenario.proforma_revenue_assumptions?.length && (
              <p>• Revenue assumptions needed</p>
            )}
            {!scenario.proforma_cogs_assumptions?.length && (
              <p>• COGS assumptions needed</p>
            )}
            {!scenario.proforma_labor_assumptions?.length && (
              <p>• Labor assumptions needed</p>
            )}
            {!scenario.proforma_occupancy_opex_assumptions?.length && (
              <p>• OpEx assumptions needed</p>
            )}
            {!scenario.proforma_capex_assumptions?.length && (
              <p>• CapEx assumptions needed</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">
              Proforma Results
            </h3>
            <p className="text-sm text-zinc-400">
              {scenario.months}-month P&L projection
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCalculate} disabled={calculating}>
              {calculating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator className="w-4 h-4 mr-2" />
                  Calculate
                </>
              )}
            </Button>
            {summary && (
              <Button variant="outline" onClick={handleExplain} disabled={loadingNarrative}>
                {loadingNarrative ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Explain
                  </>
                )}
              </Button>
            )}
            {summary && (
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {summary && (
          <div className="border-t border-zinc-800 pt-4">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Year 1 Revenue</div>
                <div className="text-2xl font-bold text-zinc-50">
                  ${(summary.year1Revenue / 1000000).toFixed(2)}M
                </div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Year 1 EBITDA</div>
                <div className="text-2xl font-bold text-zinc-50">
                  ${(summary.year1Ebitda / 1000000).toFixed(2)}M
                </div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">EBITDA Margin</div>
                <div className="text-2xl font-bold text-zinc-50">
                  {summary.ebitdaMargin.toFixed(1)}%
                </div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Payback Period</div>
                <div className="text-2xl font-bold text-zinc-50">
                  {summary.paybackMonth ? `${summary.paybackMonth}mo` : "—"}
                </div>
              </div>
            </div>

            {/* Implied Metrics */}
            <div className="border-t border-zinc-800 pt-4">
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Implied Metrics</h4>
              <div className="grid grid-cols-3 gap-4">
                {revenuePerSeat && (
                  <div className="p-3 bg-zinc-900/30 rounded">
                    <div className="text-xs text-zinc-500 mb-1">Revenue / Seat</div>
                    <div className="text-lg font-semibold text-zinc-200">
                      ${revenuePerSeat.toLocaleString()}
                    </div>
                  </div>
                )}
                {revenuePerSqft && (
                  <div className="p-3 bg-zinc-900/30 rounded">
                    <div className="text-xs text-zinc-500 mb-1">Revenue / SqFt</div>
                    <div className="text-lg font-semibold text-zinc-200">
                      ${revenuePerSqft.toLocaleString()}
                    </div>
                  </div>
                )}
                {rentPct && (
                  <div className="p-3 bg-zinc-900/30 rounded">
                    <div className="text-xs text-zinc-500 mb-1">Rent % of Sales</div>
                    <div className="text-lg font-semibold text-zinc-200">
                      {rentPct.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!summary && (
          <div className="border-t border-zinc-800 pt-4">
            <p className="text-sm text-zinc-500 text-center py-8">
              Click "Calculate" to generate proforma results
            </p>
          </div>
        )}
      </Card>

      {/* AI Narrative */}
      {narrative && (
        <Card className="p-6 border-ledger-gold/20">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-ledger-gold" />
            <h3 className="text-lg font-semibold text-zinc-50">
              Executive Summary
            </h3>
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="text-zinc-300 whitespace-pre-wrap">{narrative}</div>
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(narrative);
                alert("Copied to clipboard!");
              }}
            >
              Copy to Clipboard
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
