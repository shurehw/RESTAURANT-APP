"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

interface OpexAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
}

export function OpexAssumptions({
  scenarioId,
  assumptions,
}: OpexAssumptionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    base_rent_monthly: assumptions?.base_rent_monthly || 25000,
    cam_monthly: assumptions?.cam_monthly || 3000,
    property_tax_monthly: assumptions?.property_tax_monthly || 2000,
    utilities_monthly: assumptions?.utilities_monthly || 4000,
    insurance_monthly: assumptions?.insurance_monthly || 1500,
    linen_pct_of_sales: assumptions?.linen_pct_of_sales || 1.5,
    smallwares_pct_of_sales: assumptions?.smallwares_pct_of_sales || 1.0,
    cleaning_supplies_pct: assumptions?.cleaning_supplies_pct || 0.5,
    cc_fees_pct_of_sales: assumptions?.cc_fees_pct_of_sales || 2.5,
    other_opex_flat_monthly: assumptions?.other_opex_flat_monthly || 2000,
    marketing_pct_of_sales: assumptions?.marketing_pct_of_sales || 3.0,
    marketing_boost_months: assumptions?.marketing_boost_months || 3,
    marketing_boost_multiplier: assumptions?.marketing_boost_multiplier || 2.0,
    gna_pct_of_sales: assumptions?.gna_pct_of_sales || 4.0,
    corporate_overhead_flat_monthly: assumptions?.corporate_overhead_flat_monthly || 5000,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/assumptions/opex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          ...formData,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assumptions");
      }

      router.refresh();
      alert("OpEx assumptions saved successfully");
    } catch (error) {
      console.error("Error saving assumptions:", error);
      alert("Failed to save assumptions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-4">
          Operating Expense Assumptions
        </h3>
      </div>

      {/* Occupancy */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Rent & Occupancy (Monthly)
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="base_rent_monthly">Base Rent *</Label>
            <Input
              id="base_rent_monthly"
              type="number"
              step="0.01"
              value={formData.base_rent_monthly}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  base_rent_monthly: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="cam_monthly">CAM *</Label>
            <Input
              id="cam_monthly"
              type="number"
              step="0.01"
              value={formData.cam_monthly}
              onChange={(e) =>
                setFormData({ ...formData, cam_monthly: parseFloat(e.target.value) })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="property_tax_monthly">Property Tax *</Label>
            <Input
              id="property_tax_monthly"
              type="number"
              step="0.01"
              value={formData.property_tax_monthly}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  property_tax_monthly: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Utilities */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Utilities & Insurance (Monthly)
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="utilities_monthly">Utilities *</Label>
            <Input
              id="utilities_monthly"
              type="number"
              step="0.01"
              value={formData.utilities_monthly}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  utilities_monthly: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="insurance_monthly">Insurance *</Label>
            <Input
              id="insurance_monthly"
              type="number"
              step="0.01"
              value={formData.insurance_monthly}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  insurance_monthly: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
        </div>
      </div>

      {/* Variable OpEx */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Variable OpEx (% of Sales)
        </h4>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label htmlFor="linen_pct_of_sales">Linen %</Label>
            <Input
              id="linen_pct_of_sales"
              type="number"
              step="0.01"
              value={formData.linen_pct_of_sales}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  linen_pct_of_sales: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="smallwares_pct_of_sales">Smallwares %</Label>
            <Input
              id="smallwares_pct_of_sales"
              type="number"
              step="0.01"
              value={formData.smallwares_pct_of_sales}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  smallwares_pct_of_sales: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="cleaning_supplies_pct">Cleaning %</Label>
            <Input
              id="cleaning_supplies_pct"
              type="number"
              step="0.01"
              value={formData.cleaning_supplies_pct}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cleaning_supplies_pct: parseFloat(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="cc_fees_pct_of_sales">CC Fees %</Label>
            <Input
              id="cc_fees_pct_of_sales"
              type="number"
              step="0.01"
              value={formData.cc_fees_pct_of_sales}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cc_fees_pct_of_sales: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Other OpEx */}
      <div>
        <Label htmlFor="other_opex_flat_monthly">
          Other OpEx (Monthly Flat)
        </Label>
        <Input
          id="other_opex_flat_monthly"
          type="number"
          step="0.01"
          value={formData.other_opex_flat_monthly}
          onChange={(e) =>
            setFormData({
              ...formData,
              other_opex_flat_monthly: parseFloat(e.target.value),
            })
          }
        />
      </div>

      {/* Marketing */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Marketing</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="marketing_pct_of_sales">Marketing % *</Label>
            <Input
              id="marketing_pct_of_sales"
              type="number"
              step="0.01"
              value={formData.marketing_pct_of_sales}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  marketing_pct_of_sales: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="marketing_boost_months">Boost Months</Label>
            <Input
              id="marketing_boost_months"
              type="number"
              value={formData.marketing_boost_months}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  marketing_boost_months: parseInt(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="marketing_boost_multiplier">Boost Multiplier</Label>
            <Input
              id="marketing_boost_multiplier"
              type="number"
              step="0.1"
              value={formData.marketing_boost_multiplier}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  marketing_boost_multiplier: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      {/* G&A */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">G&A / Corporate</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="gna_pct_of_sales">G&A % of Sales *</Label>
            <Input
              id="gna_pct_of_sales"
              type="number"
              step="0.01"
              value={formData.gna_pct_of_sales}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  gna_pct_of_sales: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="corporate_overhead_flat_monthly">
              Corporate Overhead (Monthly)
            </Label>
            <Input
              id="corporate_overhead_flat_monthly"
              type="number"
              step="0.01"
              value={formData.corporate_overhead_flat_monthly}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  corporate_overhead_flat_monthly: parseFloat(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save OpEx Assumptions"}
        </Button>
      </div>
    </form>
  );
}
