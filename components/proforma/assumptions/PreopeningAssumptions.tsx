"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Construction, Loader2 } from "lucide-react";

interface PreopeningAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
}

export function PreopeningAssumptions({
  scenarioId,
  assumptions,
}: PreopeningAssumptionsProps) {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [formData, setFormData] = useState({
    duration_months: 12,

    // Capital & Expense Totals
    total_construction: 0,
    total_ffne: 0,
    total_initial_inventory_fnb: 0,
    total_initial_inventory_other: 0,
    total_preopening_payroll_fixed: 0,
    total_preopening_payroll_variable: 0,
    total_preopening_payroll_taxes: 0,
    total_preopening_opex_operating: 0,
    total_preopening_opex_occupancy: 0,
    total_preopening_opex_gna: 0,
    total_preopening_marketing: 0,
    total_preopening_training: 0,
    total_preopening_opening_order: 0,
    total_preopening_kitchen_bar: 0,
    total_working_capital: 0,
    total_contingency: 0,
    total_preopening_management_fees: 0,

    // Distribution patterns
    construction_distribution: "back_loaded",
    ffne_distribution: "back_loaded",
    payroll_fixed_distribution: "even",
    payroll_variable_distribution: "ramp",
    marketing_distribution: "late",
    inventory_distribution: "at_opening",
  });

  useEffect(() => {
    if (assumptions) {
      setFormData({
        duration_months: assumptions.duration_months || 12,
        total_construction: assumptions.total_construction || 0,
        total_ffne: assumptions.total_ffne || 0,
        total_initial_inventory_fnb: assumptions.total_initial_inventory_fnb || 0,
        total_initial_inventory_other: assumptions.total_initial_inventory_other || 0,
        total_preopening_payroll_fixed: assumptions.total_preopening_payroll_fixed || 0,
        total_preopening_payroll_variable: assumptions.total_preopening_payroll_variable || 0,
        total_preopening_payroll_taxes: assumptions.total_preopening_payroll_taxes || 0,
        total_preopening_opex_operating: assumptions.total_preopening_opex_operating || 0,
        total_preopening_opex_occupancy: assumptions.total_preopening_opex_occupancy || 0,
        total_preopening_opex_gna: assumptions.total_preopening_opex_gna || 0,
        total_preopening_marketing: assumptions.total_preopening_marketing || 0,
        total_preopening_training: assumptions.total_preopening_training || 0,
        total_preopening_opening_order: assumptions.total_preopening_opening_order || 0,
        total_preopening_kitchen_bar: assumptions.total_preopening_kitchen_bar || 0,
        total_working_capital: assumptions.total_working_capital || 0,
        total_contingency: assumptions.total_contingency || 0,
        total_preopening_management_fees: assumptions.total_preopening_management_fees || 0,
        construction_distribution: assumptions.construction_distribution || "back_loaded",
        ffne_distribution: assumptions.ffne_distribution || "back_loaded",
        payroll_fixed_distribution: assumptions.payroll_fixed_distribution || "even",
        payroll_variable_distribution: assumptions.payroll_variable_distribution || "ramp",
        marketing_distribution: assumptions.marketing_distribution || "late",
        inventory_distribution: assumptions.inventory_distribution || "at_opening",
      });
    }
  }, [assumptions]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proforma/assumptions/preopening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          scenario_id: scenarioId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save preopening assumptions");
      }

      alert("Preopening assumptions saved");
    } catch (error) {
      console.error("Error saving:", error);
      alert("Failed to save preopening assumptions");
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const response = await fetch("/api/proforma/calculate-preopening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });

      if (!response.ok) {
        throw new Error("Failed to calculate preopening");
      }

      const result = await response.json();
      alert(
        `Preopening schedule calculated: ${result.summary.recordsCreated} records created, $${result.summary.totalCapital.toLocaleString()} total capital`
      );
    } catch (error) {
      console.error("Error calculating:", error);
      alert("Failed to calculate preopening schedule");
    } finally {
      setCalculating(false);
    }
  };

  const totalCapital =
    (formData.total_construction || 0) +
    (formData.total_ffne || 0) +
    (formData.total_initial_inventory_fnb || 0) +
    (formData.total_initial_inventory_other || 0) +
    (formData.total_preopening_payroll_fixed || 0) +
    (formData.total_preopening_payroll_variable || 0) +
    (formData.total_preopening_payroll_taxes || 0) +
    (formData.total_preopening_opex_operating || 0) +
    (formData.total_preopening_opex_occupancy || 0) +
    (formData.total_preopening_opex_gna || 0) +
    (formData.total_preopening_marketing || 0) +
    (formData.total_preopening_training || 0) +
    (formData.total_preopening_opening_order || 0) +
    (formData.total_preopening_kitchen_bar || 0) +
    (formData.total_working_capital || 0) +
    (formData.total_contingency || 0) +
    (formData.total_preopening_management_fees || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-50 flex items-center gap-2">
            <Construction className="w-5 h-5 text-ledger-gold" />
            Preopening Capital
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Model all capital and expenses required before opening day
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">Total Capital Required</div>
          <div className="text-2xl font-bold text-ledger-gold">
            ${totalCapital.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Duration */}
      <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800">
        <Label htmlFor="duration_months" className="text-zinc-300">
          Preopening Duration (months)
        </Label>
        <Input
          id="duration_months"
          type="number"
          value={formData.duration_months}
          onChange={(e) =>
            setFormData({
              ...formData,
              duration_months: parseInt(e.target.value) || 12,
            })
          }
          className="mt-2 max-w-xs"
        />
        <p className="text-xs text-zinc-500 mt-1">
          Number of months before opening (used for distribution)
        </p>
      </div>

      {/* CapEx Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Capital Expenditures
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total_construction" className="text-zinc-400">
              Construction / Hard Costs
            </Label>
            <Input
              id="total_construction"
              type="number"
              value={formData.total_construction}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_construction: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-400">Distribution Pattern</Label>
            <Select
              value={formData.construction_distribution}
              onValueChange={(value) =>
                setFormData({ ...formData, construction_distribution: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="front">Front-loaded</SelectItem>
                <SelectItem value="back_loaded">Back-loaded</SelectItem>
                <SelectItem value="even">Even</SelectItem>
                <SelectItem value="ramp">Ramp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="total_ffne" className="text-zinc-400">
              FF&E (Furniture, Fixtures, Equipment)
            </Label>
            <Input
              id="total_ffne"
              type="number"
              value={formData.total_ffne}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_ffne: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-400">Distribution Pattern</Label>
            <Select
              value={formData.ffne_distribution}
              onValueChange={(value) =>
                setFormData({ ...formData, ffne_distribution: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="front">Front-loaded</SelectItem>
                <SelectItem value="back_loaded">Back-loaded</SelectItem>
                <SelectItem value="even">Even</SelectItem>
                <SelectItem value="ramp">Ramp</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Initial Inventory */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Initial Inventory
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total_initial_inventory_fnb" className="text-zinc-400">
              Food & Beverage
            </Label>
            <Input
              id="total_initial_inventory_fnb"
              type="number"
              value={formData.total_initial_inventory_fnb}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_initial_inventory_fnb: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="total_initial_inventory_other" className="text-zinc-400">
              Other (Merch, Retail)
            </Label>
            <Input
              id="total_initial_inventory_other"
              type="number"
              value={formData.total_initial_inventory_other}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_initial_inventory_other: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div className="col-span-2">
            <Label className="text-zinc-400">Inventory Distribution</Label>
            <Select
              value={formData.inventory_distribution}
              onValueChange={(value) =>
                setFormData({ ...formData, inventory_distribution: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="at_opening">At Opening (100% final month)</SelectItem>
                <SelectItem value="late">Late (70% final 2 months)</SelectItem>
                <SelectItem value="even">Even</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Preopening Payroll */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Preopening Payroll
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total_preopening_payroll_fixed" className="text-zinc-400">
              Fixed (Salaried Staff)
            </Label>
            <Input
              id="total_preopening_payroll_fixed"
              type="number"
              value={formData.total_preopening_payroll_fixed}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_payroll_fixed: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-400">Distribution Pattern</Label>
            <Select
              value={formData.payroll_fixed_distribution}
              onValueChange={(value) =>
                setFormData({ ...formData, payroll_fixed_distribution: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="even">Even</SelectItem>
                <SelectItem value="ramp">Ramp</SelectItem>
                <SelectItem value="front">Front-loaded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="total_preopening_payroll_variable" className="text-zinc-400">
              Variable (Training, Setup)
            </Label>
            <Input
              id="total_preopening_payroll_variable"
              type="number"
              value={formData.total_preopening_payroll_variable}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_payroll_variable:
                    parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-400">Distribution Pattern</Label>
            <Select
              value={formData.payroll_variable_distribution}
              onValueChange={(value) =>
                setFormData({ ...formData, payroll_variable_distribution: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ramp">Ramp</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="even">Even</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label htmlFor="total_preopening_payroll_taxes" className="text-zinc-400">
              Payroll Taxes & Benefits
            </Label>
            <Input
              id="total_preopening_payroll_taxes"
              type="number"
              value={formData.total_preopening_payroll_taxes}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_payroll_taxes: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Preopening OpEx */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Preopening Operating Expenses
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total_preopening_opex_operating" className="text-zinc-400">
              Operating (IT, Licenses, Printing)
            </Label>
            <Input
              id="total_preopening_opex_operating"
              type="number"
              value={formData.total_preopening_opex_operating}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_opex_operating:
                    parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="total_preopening_opex_occupancy" className="text-zinc-400">
              Occupancy (Rent, Property Tax)
            </Label>
            <Input
              id="total_preopening_opex_occupancy"
              type="number"
              value={formData.total_preopening_opex_occupancy}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_opex_occupancy:
                    parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="total_preopening_opex_gna" className="text-zinc-400">
              G&A (Legal, Travel, Misc)
            </Label>
            <Input
              id="total_preopening_opex_gna"
              type="number"
              value={formData.total_preopening_opex_gna}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_opex_gna: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Other Preopening Costs */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Other Preopening Costs
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total_preopening_marketing" className="text-zinc-400">
              Marketing & F&F Party
            </Label>
            <Input
              id="total_preopening_marketing"
              type="number"
              value={formData.total_preopening_marketing}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_marketing: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-zinc-400">Distribution Pattern</Label>
            <Select
              value={formData.marketing_distribution}
              onValueChange={(value) =>
                setFormData({ ...formData, marketing_distribution: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="even">Even</SelectItem>
                <SelectItem value="at_opening">At Opening</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="total_preopening_training" className="text-zinc-400">
              Training & Uniforms
            </Label>
            <Input
              id="total_preopening_training"
              type="number"
              value={formData.total_preopening_training}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_training: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="total_preopening_opening_order" className="text-zinc-400">
              Opening Order (Paper, Decorations)
            </Label>
            <Input
              id="total_preopening_opening_order"
              type="number"
              value={formData.total_preopening_opening_order}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_opening_order: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="total_preopening_kitchen_bar" className="text-zinc-400">
              Kitchen & Bar (Glassware, Smallwares, China)
            </Label>
            <Input
              id="total_preopening_kitchen_bar"
              type="number"
              value={formData.total_preopening_kitchen_bar}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_kitchen_bar: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Working Capital & Contingency */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Reserves
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="total_working_capital" className="text-zinc-400">
              Working Capital
            </Label>
            <Input
              id="total_working_capital"
              type="number"
              value={formData.total_working_capital}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_working_capital: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="total_contingency" className="text-zinc-400">
              Contingency
            </Label>
            <Input
              id="total_contingency"
              type="number"
              value={formData.total_contingency}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_contingency: parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="total_preopening_management_fees" className="text-zinc-400">
              Preopening Management Fees
            </Label>
            <Input
              id="total_preopening_management_fees"
              type="number"
              value={formData.total_preopening_management_fees}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  total_preopening_management_fees:
                    parseFloat(e.target.value) || 0,
                })
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-zinc-800">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save Assumptions"}
        </Button>
        <Button
          onClick={handleCalculate}
          disabled={calculating}
          variant="outline"
        >
          {calculating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Calculating Schedule...
            </>
          ) : (
            "Calculate Preopening Schedule"
          )}
        </Button>
      </div>
    </div>
  );
}
