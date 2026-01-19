"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RevenueMatrixView } from "./RevenueMatrixView";
import { ServicePeriodsManager } from "./ServicePeriodsManager";
import { RevenueCentersManager } from "./RevenueCentersManager";
import { CenterParticipationMatrix } from "./CenterParticipationMatrix";

interface ServicePeriod {
  id: string;
  service_name: string;
  avg_covers_per_service: number;
  avg_check: number;
  food_pct: number;
  bev_pct: number;
  other_pct: number;
  days_per_week: number;
  sort_order: number;
}

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
  const [servicePeriods, setServicePeriods] = useState<ServicePeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);

  const [formData, setFormData] = useState({
    days_open_per_week: assumptions?.days_open_per_week || 7,
    services_per_day: assumptions?.services_per_day || 2,

    // Covers per daypart
    avg_covers_lunch: assumptions?.avg_covers_lunch || "",
    avg_covers_dinner: assumptions?.avg_covers_dinner || "",
    avg_covers_late_night: assumptions?.avg_covers_late_night || "",

    // Average check per daypart (total, not split by F&B)
    avg_check_lunch: assumptions?.avg_check_lunch || assumptions?.avg_check_food_lunch || "",
    avg_check_dinner: assumptions?.avg_check_dinner || assumptions?.avg_check_food_dinner || "",
    avg_check_late_night: assumptions?.avg_check_late_night || assumptions?.avg_check_food_late_night || "",

    // Mix (stored as decimals 0-1, displayed as percentages)
    food_mix_pct: assumptions?.food_mix_pct ? assumptions.food_mix_pct * 100 : 60,
    bev_mix_pct: assumptions?.bev_mix_pct ? assumptions.bev_mix_pct * 100 : 35,
    other_mix_pct: assumptions?.other_mix_pct ? assumptions.other_mix_pct * 100 : 5,

    // Ramp
    ramp_months: assumptions?.ramp_months || 12,
    ramp_start_pct: assumptions?.ramp_start_pct || 80,
    ramp_curve: assumptions?.ramp_curve || "linear",

    // Seasonality
    seasonality_curve: assumptions?.seasonality_curve || Array(12).fill(1.0),
    seasonality_preset: assumptions?.seasonality_preset || "none",

    // Day of Week Distribution
    day_of_week_distribution: assumptions?.day_of_week_distribution || [14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2], // Default: equal distribution
  });

  // Fetch service periods from database
  useEffect(() => {
    async function fetchServicePeriods() {
      try {
        setLoadingPeriods(true);
        const response = await fetch(`/api/proforma/service-periods?scenario_id=${scenarioId}`);
        if (!response.ok) throw new Error("Failed to fetch service periods");
        const data = await response.json();
        setServicePeriods(data.servicePeriods || []);
      } catch (error) {
        console.error("Error fetching service periods:", error);
      } finally {
        setLoadingPeriods(false);
      }
    }
    fetchServicePeriods();
  }, [scenarioId]);

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

          avg_check_lunch: formData.avg_check_lunch ? parseFloat(formData.avg_check_lunch as any) : null,
          avg_check_dinner: formData.avg_check_dinner ? parseFloat(formData.avg_check_dinner as any) : null,
          avg_check_late_night: formData.avg_check_late_night ? parseFloat(formData.avg_check_late_night as any) : null,

          // Convert percentages from display (0-100) to storage (0-1)
          food_mix_pct: formData.food_mix_pct / 100,
          bev_mix_pct: formData.bev_mix_pct / 100,
          other_mix_pct: formData.other_mix_pct / 100,

          ramp_months: formData.ramp_months,
          ramp_start_pct: formData.ramp_start_pct,
          ramp_curve: formData.ramp_curve,

          seasonality_curve: showAdvanced ? formData.seasonality_curve : null,
          seasonality_preset: showAdvanced ? formData.seasonality_preset : "none",

          day_of_week_distribution: formData.day_of_week_distribution,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assumptions");
      }

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

  // Ramp calculation function
  const calculateRampPct = (monthIndex: number, totalMonths: number, startPct: number, curve: string): number => {
    if (totalMonths === 0) return 100;
    if (monthIndex >= totalMonths) return 100;

    const progress = (monthIndex + 1) / totalMonths; // 0 to 1
    const range = 100 - startPct;

    let curveFactor: number;
    switch (curve) {
      case "front-loaded":
        // Fast start, then slows: sqrt curve
        curveFactor = Math.sqrt(progress);
        break;
      case "back-loaded":
        // Slow start, then accelerates: squared curve
        curveFactor = progress * progress;
        break;
      case "s-curve":
        // Sigmoid-like: slow → fast → slow
        curveFactor = (Math.sin((progress - 0.5) * Math.PI) + 1) / 2;
        break;
      case "linear":
      default:
        curveFactor = progress;
        break;
    }

    return startPct + (range * curveFactor);
  };

  // Preset patterns for day of week distribution
  const applyDayPreset = (preset: string) => {
    let newDist: number[];
    switch (preset) {
      case "equal":
        newDist = [14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2];
        break;
      case "weekend-heavy":
        // Fri-Sun heavier
        newDist = [10, 10, 10, 12, 18, 20, 20];
        break;
      case "weekday-heavy":
        // Mon-Thu heavier
        newDist = [16, 16, 16, 16, 12, 12, 12];
        break;
      case "nightlife":
        // Thu-Sat peak
        newDist = [8, 8, 10, 18, 22, 24, 10];
        break;
      default:
        newDist = formData.day_of_week_distribution;
    }
    setFormData({ ...formData, day_of_week_distribution: newDist });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-4">
          Revenue Assumptions
        </h3>
      </div>

      {/* Center Participation Matrix - Assign centers to service periods */}
      <div className="mb-6">
        <CenterParticipationMatrix scenarioId={scenarioId} />
      </div>

      <RevenueMatrixView scenarioId={scenarioId} />

      <div className="mt-6 space-y-6">
        {/* Legacy form kept for ramp/seasonality until moved elsewhere */}
        <div className="hidden">{/* Keep this section hidden for now */}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Ramp Settings */}
            <div className="border-b border-zinc-800 pb-6">
              <h4 className="text-md font-semibold text-black mb-3">Ramp Period</h4>
              <p className="text-sm text-zinc-600 mb-4">
                Define how revenue scales from opening through stabilization
              </p>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <Label htmlFor="starting_pct">Starting %</Label>
                  <Input
                    id="starting_pct"
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.ramp_start_pct}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, ramp_start_pct: val === '' ? 0 : parseInt(val) });
                    }}
                    className="h-9"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    % of full volume at opening
                  </p>
                </div>

                <div>
                  <Label htmlFor="ramp_months">Ramp Duration (Months)</Label>
                  <Input
                    id="ramp_months"
                    type="number"
                    value={formData.ramp_months}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, ramp_months: val === '' ? 0 : parseInt(val) });
                    }}
                    min="0"
                    max="24"
                    className="h-9"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Months to reach 100%
                  </p>
                </div>

                <div>
                  <Label htmlFor="ramp_curve">Ramp Curve</Label>
                  <select
                    id="ramp_curve"
                    value={formData.ramp_curve}
                    className="w-full h-9 px-3 rounded-md border border-zinc-300 text-sm"
                    onChange={(e) =>
                      setFormData({ ...formData, ramp_curve: e.target.value })
                    }
                  >
                    <option value="linear">Linear</option>
                    <option value="front-loaded">Front-Loaded (Fast Start)</option>
                    <option value="back-loaded">Back-Loaded (Slow Build)</option>
                    <option value="s-curve">S-Curve (Gradual)</option>
                  </select>
                  <p className="text-xs text-zinc-500 mt-1">
                    How quickly to scale up
                  </p>
                </div>
              </div>

              {/* Visual Ramp Preview */}
              {formData.ramp_months > 0 && (
                <div className="mt-4 p-4 bg-zinc-50 rounded border border-zinc-200">
                  <div className="text-xs font-medium text-zinc-700 mb-2">Ramp Schedule Preview</div>
                  <div className="grid grid-cols-12 gap-1">
                    {Array.from({ length: Math.min(formData.ramp_months, 12) }).map((_, i) => {
                      const monthPct = calculateRampPct(
                        i,
                        formData.ramp_months,
                        formData.ramp_start_pct,
                        formData.ramp_curve
                      );

                      return (
                        <div key={i} className="text-center">
                          <div
                            className="bg-[#D4AF37] rounded-t"
                            style={{ height: `${monthPct}px` }}
                          />
                          <div className="text-[10px] text-zinc-500 mt-1">M{i + 1}</div>
                          <div className="text-[10px] font-semibold text-zinc-700">{Math.round(monthPct)}%</div>
                        </div>
                      );
                    })}
                  </div>
                  {formData.ramp_months > 12 && (
                    <div className="text-xs text-zinc-500 mt-2 italic">
                      Showing first 12 months of {formData.ramp_months} month ramp
                    </div>
                  )}
                </div>
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
        </div>
      </div>
    </div>
  );
}
