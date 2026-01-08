"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

interface CapexAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
}

export function CapexAssumptions({
  scenarioId,
  assumptions,
}: CapexAssumptionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    total_capex: assumptions?.total_capex || 2500000,
    // Display as 0-100, stored as 0-1
    equity_pct: assumptions?.equity_pct ? assumptions.equity_pct * 100 : 40,
    debt_interest_rate: assumptions?.debt_interest_rate ? assumptions.debt_interest_rate * 100 : 7.5,
    debt_term_months: assumptions?.debt_term_months || 120,
    interest_only_months: assumptions?.interest_only_months || 12,
    lender_fee_pct: assumptions?.lender_fee_pct ? assumptions.lender_fee_pct * 100 : 0,
    lender_fee_capitalize: assumptions?.lender_fee_capitalize !== false, // default true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/assumptions/capex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          total_capex: formData.total_capex,
          // Convert from display (0-100) to storage (0-1)
          equity_pct: formData.equity_pct / 100,
          debt_interest_rate: formData.debt_interest_rate / 100,
          debt_term_months: formData.debt_term_months,
          interest_only_months: formData.interest_only_months,
          lender_fee_pct: formData.lender_fee_pct / 100,
          lender_fee_capitalize: formData.lender_fee_capitalize,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assumptions");
      }

      router.refresh();
      alert("CapEx assumptions saved successfully");
    } catch (error) {
      console.error("Error saving assumptions:", error);
      alert("Failed to save assumptions");
    } finally {
      setLoading(false);
    }
  };

  // Calculate debt amount
  let debtAmount = formData.total_capex * (1 - formData.equity_pct / 100);
  const equityAmount = formData.total_capex * (formData.equity_pct / 100);
  const lenderFee = debtAmount * (formData.lender_fee_pct / 100);
  const effectiveDebt = formData.lender_fee_capitalize ? debtAmount + lenderFee : debtAmount;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-4">
          CapEx & Financing Assumptions
        </h3>
      </div>

      {/* Total CapEx */}
      <div>
        <Label htmlFor="total_capex">Total CapEx *</Label>
        <Input
          id="total_capex"
          type="number"
          step="1000"
          value={formData.total_capex}
          onChange={(e) =>
            setFormData({ ...formData, total_capex: parseFloat(e.target.value) })
          }
          required
        />
        <p className="text-xs text-zinc-500 mt-1">
          Total capital expenditure for build-out
        </p>
      </div>

      {/* Equity */}
      <div>
        <Label htmlFor="equity_pct">Equity % *</Label>
        <Input
          id="equity_pct"
          type="number"
          step="0.01"
          value={formData.equity_pct}
          onChange={(e) =>
            setFormData({ ...formData, equity_pct: parseFloat(e.target.value) })
          }
          required
        />
        <p className="text-xs text-zinc-500 mt-1">
          Equity: ${equityAmount.toLocaleString()} | Debt: $
          {debtAmount.toLocaleString()}
        </p>
      </div>

      {/* Debt Terms */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Debt Terms</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="debt_interest_rate">Interest Rate % *</Label>
            <Input
              id="debt_interest_rate"
              type="number"
              step="0.01"
              value={formData.debt_interest_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  debt_interest_rate: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="debt_term_months">Term (Months) *</Label>
            <Input
              id="debt_term_months"
              type="number"
              value={formData.debt_term_months}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  debt_term_months: parseInt(e.target.value),
                })
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Interest Only Period */}
      <div>
        <Label htmlFor="interest_only_months">Interest-Only Period (Months)</Label>
        <Input
          id="interest_only_months"
          type="number"
          value={formData.interest_only_months}
          onChange={(e) =>
            setFormData({
              ...formData,
              interest_only_months: parseInt(e.target.value),
            })
          }
        />
        <p className="text-xs text-zinc-500 mt-1">
          Number of months with interest-only payments before principal amortization
        </p>
      </div>

      {/* Lender Fees */}
      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Lender Fees</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="lender_fee_pct">Origination Fee %</Label>
            <Input
              id="lender_fee_pct"
              type="number"
              step="0.01"
              value={formData.lender_fee_pct}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  lender_fee_pct: parseFloat(e.target.value),
                })
              }
            />
            <p className="text-xs text-zinc-500 mt-1">
              Fee: ${lenderFee.toLocaleString()}
            </p>
          </div>
          <div>
            <Label htmlFor="lender_fee_capitalize">Treatment</Label>
            <select
              id="lender_fee_capitalize"
              value={formData.lender_fee_capitalize ? "capitalize" : "expense"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  lender_fee_capitalize: e.target.value === "capitalize",
                })
              }
              className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50"
            >
              <option value="capitalize">Capitalize (add to loan balance)</option>
              <option value="expense">Expense in Month 1</option>
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              {formData.lender_fee_capitalize
                ? `Effective debt: $${effectiveDebt.toLocaleString()}`
                : `Upfront expense: $${lenderFee.toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save CapEx Assumptions"}
        </Button>
      </div>
    </form>
  );
}
