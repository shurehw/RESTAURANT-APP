"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

interface CogsAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
}

export function CogsAssumptions({ scenarioId, assumptions }: CogsAssumptionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    food_cogs_pct: assumptions?.food_cogs_pct || 28,
    bev_cogs_pct: assumptions?.bev_cogs_pct || 22,
    other_cogs_pct: assumptions?.other_cogs_pct || 25,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/assumptions/cogs", {
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
      alert("COGS assumptions saved successfully");
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
          COGS Assumptions
        </h3>
        <p className="text-sm text-zinc-400">
          Enter COGS as a percentage of respective sales category
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="food_cogs_pct">Food COGS % *</Label>
          <Input
            id="food_cogs_pct"
            type="number"
            step="0.01"
            value={formData.food_cogs_pct}
            onChange={(e) =>
              setFormData({ ...formData, food_cogs_pct: parseFloat(e.target.value) })
            }
            required
          />
          <p className="text-xs text-zinc-500 mt-1">% of Food Sales</p>
        </div>
        <div>
          <Label htmlFor="bev_cogs_pct">Beverage COGS % *</Label>
          <Input
            id="bev_cogs_pct"
            type="number"
            step="0.01"
            value={formData.bev_cogs_pct}
            onChange={(e) =>
              setFormData({ ...formData, bev_cogs_pct: parseFloat(e.target.value) })
            }
            required
          />
          <p className="text-xs text-zinc-500 mt-1">% of Beverage Sales</p>
        </div>
        <div>
          <Label htmlFor="other_cogs_pct">Other COGS % *</Label>
          <Input
            id="other_cogs_pct"
            type="number"
            step="0.01"
            value={formData.other_cogs_pct}
            onChange={(e) =>
              setFormData({ ...formData, other_cogs_pct: parseFloat(e.target.value) })
            }
            required
          />
          <p className="text-xs text-zinc-500 mt-1">% of Other Sales</p>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save COGS Assumptions"}
        </Button>
      </div>
    </form>
  );
}
