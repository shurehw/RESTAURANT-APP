"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface CreateScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  hasBaseScenario: boolean;
  baseScenarioId?: string;
}

export function CreateScenarioDialog({
  open,
  onOpenChange,
  projectId,
  hasBaseScenario,
  baseScenarioId,
}: CreateScenarioDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [scenarioType, setScenarioType] = useState<"BASE" | "SENSITIVITY">(
    hasBaseScenario ? "SENSITIVITY" : "BASE"
  );

  const [basicInfo, setBasicInfo] = useState({
    name: hasBaseScenario ? "Upside" : "Base",
    is_base: !hasBaseScenario,
    months: "60",
    start_month: new Date().toISOString().slice(0, 7) + "-01",
  });

  // Sensitivity adjustments
  const [adjustments, setAdjustments] = useState({
    covers_multiplier: null as number | null,
    check_avg_offset: null as number | null,
    food_cogs_pct_override: null as number | null,
    bev_cogs_pct_override: null as number | null,
    wage_rate_offset: null as number | null,
    efficiency_multiplier: null as number | null,
    rent_monthly_override: null as number | null,
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create scenario
      const scenarioRes = await fetch("/api/proforma/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...basicInfo,
          project_id: projectId,
          months: parseInt(basicInfo.months),
          scenario_type: scenarioType,
        }),
      });

      if (!scenarioRes.ok) {
        throw new Error("Failed to create scenario");
      }

      const { scenario } = await scenarioRes.json();

      // 2. If sensitivity scenario, create adjustments
      if (scenarioType === "SENSITIVITY" && baseScenarioId) {
        await fetch("/api/proforma/scenario-adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            base_scenario_id: baseScenarioId,
            ...adjustments,
          }),
        });
      }

      onOpenChange(false);
      router.refresh();

      // Reset form
      setBasicInfo({
        name: "Upside",
        is_base: false,
        months: "60",
        start_month: new Date().toISOString().slice(0, 7) + "-01",
      });
      setAdjustments({
        covers_multiplier: null,
        check_avg_offset: null,
        food_cogs_pct_override: null,
        bev_cogs_pct_override: null,
        wage_rate_offset: null,
        efficiency_multiplier: null,
        rent_monthly_override: null,
        description: "",
      });
    } catch (error) {
      console.error("Error creating scenario:", error);
      alert("Failed to create scenario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {scenarioType === "BASE" ? "Create Base Scenario" : "Create Sensitivity Scenario"}
          </DialogTitle>
          <DialogDescription>
            {scenarioType === "BASE"
              ? "Create a full detailed financial model (use the wizard for complete setup)"
              : "Create a what-if scenario with delta adjustments to your Base case"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Scenario Name *</Label>
              <Input
                id="name"
                value={basicInfo.name}
                onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                placeholder={scenarioType === "BASE" ? "Base Case" : "Upside, Downside, etc."}
                required
              />
            </div>

            {scenarioType === "BASE" && (
              <>
                <div>
                  <Label htmlFor="months">Projection Period (Months) *</Label>
                  <Input
                    id="months"
                    type="number"
                    value={basicInfo.months}
                    onChange={(e) => setBasicInfo({ ...basicInfo, months: e.target.value })}
                    min="12"
                    max="120"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="start_month">Start Month *</Label>
                  <Input
                    id="start_month"
                    type="date"
                    value={basicInfo.start_month}
                    onChange={(e) =>
                      setBasicInfo({ ...basicInfo, start_month: e.target.value })
                    }
                    required
                  />
                </div>

                <Card className="p-4 bg-blue-950/30 border-blue-800/50">
                  <p className="text-sm text-blue-300">
                    💡 For full setup with service periods, labor positions, and all assumptions, use the{" "}
                    <strong>Scenario Wizard</strong> from the project creation flow.
                  </p>
                </Card>
              </>
            )}
          </div>

          {/* Sensitivity Adjustments */}
          {scenarioType === "SENSITIVITY" && (
            <Tabs defaultValue="revenue" className="w-full">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
                <TabsTrigger value="cogs">COGS</TabsTrigger>
                <TabsTrigger value="labor">Labor</TabsTrigger>
                <TabsTrigger value="opex">OpEx</TabsTrigger>
              </TabsList>

              <TabsContent value="revenue" className="space-y-4">
                <Card className="p-4 bg-zinc-900/50">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-3">Revenue Adjustments</h4>
                  <p className="text-xs text-zinc-500 mb-4">
                    Leave blank to use Base values. Adjustments are applied on top of Base scenario.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="covers_multiplier" className="text-sm">
                        Covers Multiplier
                      </Label>
                      <Input
                        id="covers_multiplier"
                        type="number"
                        step="0.01"
                        placeholder="1.10 = +10%, 0.85 = -15%"
                        value={adjustments.covers_multiplier || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            covers_multiplier: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Multiply base covers by this factor (1.0 = no change)
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="check_avg_offset" className="text-sm">
                        Check Average Adjustment ($)
                      </Label>
                      <Input
                        id="check_avg_offset"
                        type="number"
                        step="0.01"
                        placeholder="+2.50 = $2.50 higher, -3.00 = $3 lower"
                        value={adjustments.check_avg_offset || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            check_avg_offset: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Add/subtract from base check average
                      </p>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="cogs" className="space-y-4">
                <Card className="p-4 bg-zinc-900/50">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-3">COGS % Overrides</h4>
                  <p className="text-xs text-zinc-500 mb-4">
                    Leave blank to use Base COGS percentages. Enter values to override.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="food_cogs" className="text-sm">
                        Food COGS %
                      </Label>
                      <Input
                        id="food_cogs"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 30.5"
                        value={adjustments.food_cogs_pct_override || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            food_cogs_pct_override: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor="bev_cogs" className="text-sm">
                        Beverage COGS %
                      </Label>
                      <Input
                        id="bev_cogs"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 24.0"
                        value={adjustments.bev_cogs_pct_override || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            bev_cogs_pct_override: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="labor" className="space-y-4">
                <Card className="p-4 bg-zinc-900/50">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-3">Labor Adjustments</h4>
                  <p className="text-xs text-zinc-500 mb-4">
                    Adjust wages and efficiency relative to Base scenario.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="wage_offset" className="text-sm">
                        Wage Rate Adjustment ($/hr)
                      </Label>
                      <Input
                        id="wage_offset"
                        type="number"
                        step="0.01"
                        placeholder="+1.50 = everyone gets $1.50/hr more"
                        value={adjustments.wage_rate_offset || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            wage_rate_offset: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Add/subtract from all hourly rates
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="efficiency" className="text-sm">
                        Labor Efficiency Multiplier
                      </Label>
                      <Input
                        id="efficiency"
                        type="number"
                        step="0.01"
                        placeholder="0.95 = 5% more efficient, 1.10 = 10% less"
                        value={adjustments.efficiency_multiplier || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            efficiency_multiplier: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Multiply hours needed (1.0 = no change)
                      </p>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="opex" className="space-y-4">
                <Card className="p-4 bg-zinc-900/50">
                  <h4 className="text-sm font-semibold text-zinc-300 mb-3">OpEx Adjustments</h4>
                  <p className="text-xs text-zinc-500 mb-4">
                    Override specific OpEx items. Leave blank to use Base values.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="rent" className="text-sm">
                        Monthly Rent Override ($)
                      </Label>
                      <Input
                        id="rent"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 14500"
                        value={adjustments.rent_monthly_override || ""}
                        onChange={(e) =>
                          setAdjustments({
                            ...adjustments,
                            rent_monthly_override: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Replace base rent with this amount
                      </p>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Description */}
          {scenarioType === "SENSITIVITY" && (
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                value={adjustments.description}
                onChange={(e) =>
                  setAdjustments({ ...adjustments, description: e.target.value })
                }
                placeholder="e.g., 10% higher covers with better pricing"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Scenario"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
