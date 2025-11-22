"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RevenueAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
}

export function RevenueAssumptions({
  scenarioId,
  assumptions,
}: RevenueAssumptionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(!!assumptions?.seasonality_curve);

  const [formData, setFormData] = useState({
    days_open_per_week: assumptions?.days_open_per_week || 7,
    services_per_day: assumptions?.services_per_day || 2,

    // Covers per daypart
    avg_covers_lunch: assumptions?.avg_covers_lunch || "",
    avg_covers_dinner: assumptions?.avg_covers_dinner || "",
    avg_covers_late_night: assumptions?.avg_covers_late_night || "",

    // Food checks per daypart
    avg_check_food_lunch: assumptions?.avg_check_food_lunch || "",
    avg_check_food_dinner: assumptions?.avg_check_food_dinner || "",
    avg_check_food_late_night: assumptions?.avg_check_food_late_night || "",

    // Bev checks per daypart
    avg_check_bev_lunch: assumptions?.avg_check_bev_lunch || "",
    avg_check_bev_dinner: assumptions?.avg_check_bev_dinner || "",
    avg_check_bev_late_night: assumptions?.avg_check_bev_late_night || "",

    // Global fallbacks (deprecated but kept for backwards compat)
    avg_check_food: assumptions?.avg_check_food || "",
    avg_check_bev: assumptions?.avg_check_bev || "",

    // Mix
    food_mix_pct: assumptions?.food_mix_pct || 60,
    bev_mix_pct: assumptions?.bev_mix_pct || 35,
    other_mix_pct: assumptions?.other_mix_pct || 5,

    // Ramp
    ramp_months: assumptions?.ramp_months || 12,

    // Seasonality
    seasonality_curve: assumptions?.seasonality_curve || Array(12).fill(1.0),
    seasonality_preset: assumptions?.seasonality_preset || "none",

    // Day of Week Distribution
    day_of_week_distribution: assumptions?.day_of_week_distribution || [14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2], // Default: equal distribution
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/assumptions/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          days_open_per_week: formData.days_open_per_week,
          services_per_day: formData.services_per_day,

          avg_covers_lunch: formData.avg_covers_lunch ? parseFloat(formData.avg_covers_lunch as any) : null,
          avg_covers_dinner: formData.avg_covers_dinner ? parseFloat(formData.avg_covers_dinner as any) : null,
          avg_covers_late_night: formData.avg_covers_late_night ? parseFloat(formData.avg_covers_late_night as any) : null,

          avg_check_food_lunch: formData.avg_check_food_lunch ? parseFloat(formData.avg_check_food_lunch as any) : null,
          avg_check_food_dinner: formData.avg_check_food_dinner ? parseFloat(formData.avg_check_food_dinner as any) : null,
          avg_check_food_late_night: formData.avg_check_food_late_night ? parseFloat(formData.avg_check_food_late_night as any) : null,

          avg_check_bev_lunch: formData.avg_check_bev_lunch ? parseFloat(formData.avg_check_bev_lunch as any) : null,
          avg_check_bev_dinner: formData.avg_check_bev_dinner ? parseFloat(formData.avg_check_bev_dinner as any) : null,
          avg_check_bev_late_night: formData.avg_check_bev_late_night ? parseFloat(formData.avg_check_bev_late_night as any) : null,

          avg_check_food: formData.avg_check_food ? parseFloat(formData.avg_check_food as any) : null,
          avg_check_bev: formData.avg_check_bev ? parseFloat(formData.avg_check_bev as any) : null,

          food_mix_pct: formData.food_mix_pct,
          bev_mix_pct: formData.bev_mix_pct,
          other_mix_pct: formData.other_mix_pct,

          ramp_months: formData.ramp_months,

          seasonality_curve: showAdvanced ? formData.seasonality_curve : null,
          seasonality_preset: showAdvanced ? formData.seasonality_preset : "none",

          day_of_week_distribution: formData.day_of_week_distribution,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assumptions");
      }

      router.refresh();
      alert("Revenue assumptions saved successfully");
    } catch (error) {
      console.error("Error saving assumptions:", error);
      alert("Failed to save assumptions");
    } finally {
      setLoading(false);
    }
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Calculate current total percentage
  const totalDayPct = formData.day_of_week_distribution.reduce((sum: number, val: number) => sum + val, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-4">
          Revenue Assumptions
        </h3>
      </div>

      {/* Operations */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="days_open_per_week">Days Open Per Week *</Label>
          <Input
            id="days_open_per_week"
            type="number"
            value={formData.days_open_per_week}
            onChange={(e) =>
              setFormData({
                ...formData,
                days_open_per_week: parseInt(e.target.value),
              })
            }
            min="1"
            max="7"
            required
          />
        </div>
        <div>
          <Label htmlFor="ramp_months">Ramp Period (Months) *</Label>
          <Input
            id="ramp_months"
            type="number"
            value={formData.ramp_months}
            onChange={(e) =>
              setFormData({ ...formData, ramp_months: parseInt(e.target.value) })
            }
            min="0"
            max="24"
            required
          />
          <p className="text-xs text-zinc-500 mt-1">
            Number of months to ramp up to full volume
          </p>
        </div>
      </div>

      {/* Daypart Tabs */}
      <div>
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Covers & Checks by Daypart</h4>
        <Tabs defaultValue="lunch" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="lunch">Lunch</TabsTrigger>
            <TabsTrigger value="dinner">Dinner</TabsTrigger>
            <TabsTrigger value="late">Late Night</TabsTrigger>
          </TabsList>

          <TabsContent value="lunch" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="avg_covers_lunch">Avg Covers</Label>
                <Input
                  id="avg_covers_lunch"
                  type="number"
                  step="0.01"
                  value={formData.avg_covers_lunch}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_covers_lunch: e.target.value })
                  }
                  placeholder="100"
                />
              </div>
              <div>
                <Label htmlFor="avg_check_food_lunch">Food Check ($)</Label>
                <Input
                  id="avg_check_food_lunch"
                  type="number"
                  step="0.01"
                  value={formData.avg_check_food_lunch}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_check_food_lunch: e.target.value })
                  }
                  placeholder="35.00"
                />
              </div>
              <div>
                <Label htmlFor="avg_check_bev_lunch">Bev Check ($)</Label>
                <Input
                  id="avg_check_bev_lunch"
                  type="number"
                  step="0.01"
                  value={formData.avg_check_bev_lunch}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_check_bev_lunch: e.target.value })
                  }
                  placeholder="15.00"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="dinner" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="avg_covers_dinner">Avg Covers</Label>
                <Input
                  id="avg_covers_dinner"
                  type="number"
                  step="0.01"
                  value={formData.avg_covers_dinner}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_covers_dinner: e.target.value })
                  }
                  placeholder="200"
                />
              </div>
              <div>
                <Label htmlFor="avg_check_food_dinner">Food Check ($)</Label>
                <Input
                  id="avg_check_food_dinner"
                  type="number"
                  step="0.01"
                  value={formData.avg_check_food_dinner}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_check_food_dinner: e.target.value })
                  }
                  placeholder="50.00"
                />
              </div>
              <div>
                <Label htmlFor="avg_check_bev_dinner">Bev Check ($)</Label>
                <Input
                  id="avg_check_bev_dinner"
                  type="number"
                  step="0.01"
                  value={formData.avg_check_bev_dinner}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_check_bev_dinner: e.target.value })
                  }
                  placeholder="30.00"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="late" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="avg_covers_late_night">Avg Covers</Label>
                <Input
                  id="avg_covers_late_night"
                  type="number"
                  step="0.01"
                  value={formData.avg_covers_late_night}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_covers_late_night: e.target.value })
                  }
                  placeholder="50"
                />
              </div>
              <div>
                <Label htmlFor="avg_check_food_late_night">Food Check ($)</Label>
                <Input
                  id="avg_check_food_late_night"
                  type="number"
                  step="0.01"
                  value={formData.avg_check_food_late_night}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_check_food_late_night: e.target.value })
                  }
                  placeholder="25.00"
                />
              </div>
              <div>
                <Label htmlFor="avg_check_bev_late_night">Bev Check ($)</Label>
                <Input
                  id="avg_check_bev_late_night"
                  type="number"
                  step="0.01"
                  value={formData.avg_check_bev_late_night}
                  onChange={(e) =>
                    setFormData({ ...formData, avg_check_bev_late_night: e.target.value })
                  }
                  placeholder="20.00"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Mix % */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="food_mix_pct">Food Mix % *</Label>
          <Input
            id="food_mix_pct"
            type="number"
            step="0.01"
            value={formData.food_mix_pct}
            onChange={(e) =>
              setFormData({
                ...formData,
                food_mix_pct: parseFloat(e.target.value),
              })
            }
            required
          />
        </div>
        <div>
          <Label htmlFor="bev_mix_pct">Beverage Mix % *</Label>
          <Input
            id="bev_mix_pct"
            type="number"
            step="0.01"
            value={formData.bev_mix_pct}
            onChange={(e) =>
              setFormData({ ...formData, bev_mix_pct: parseFloat(e.target.value) })
            }
            required
          />
        </div>
        <div>
          <Label htmlFor="other_mix_pct">Other Mix % *</Label>
          <Input
            id="other_mix_pct"
            type="number"
            step="0.01"
            value={formData.other_mix_pct}
            onChange={(e) =>
              setFormData({
                ...formData,
                other_mix_pct: parseFloat(e.target.value),
              })
            }
            required
          />
        </div>
      </div>

      {/* Day of Week Distribution */}
      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Day of Week Sales Distribution</h4>
        <div className="grid grid-cols-7 gap-2">
          {dayNames.map((day, idx) => (
            <div key={day}>
              <Label htmlFor={`day_${idx}`} className="text-xs">
                {day}
              </Label>
              <Input
                id={`day_${idx}`}
                type="number"
                step="0.1"
                value={formData.day_of_week_distribution[idx]}
                onChange={(e) => {
                  const newDist = [...formData.day_of_week_distribution];
                  newDist[idx] = parseFloat(e.target.value) || 0;
                  setFormData({ ...formData, day_of_week_distribution: newDist });
                }}
                className="text-xs"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Enter percentage of weekly sales for each day (must total 100%). Current total: {totalDayPct.toFixed(1)}%
        </p>
      </div>

      {/* Seasonality */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-zinc-300">Seasonality (Optional)</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide" : "Show"}
          </Button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-6 gap-2">
            {monthNames.map((month, idx) => (
              <div key={month}>
                <Label htmlFor={`season_${idx}`} className="text-xs">
                  {month}
                </Label>
                <Input
                  id={`season_${idx}`}
                  type="number"
                  step="0.01"
                  value={formData.seasonality_curve[idx]}
                  onChange={(e) => {
                    const newCurve = [...formData.seasonality_curve];
                    newCurve[idx] = parseFloat(e.target.value) || 1.0;
                    setFormData({ ...formData, seasonality_curve: newCurve });
                  }}
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        )}
        {showAdvanced && (
          <p className="text-xs text-zinc-500 mt-2">
            Enter multipliers for each month (1.0 = average, 1.2 = 20% above average, 0.8 = 20% below)
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save Revenue Assumptions"}
        </Button>
      </div>
    </form>
  );
}
