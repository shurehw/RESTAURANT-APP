"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Plus, Trash2, Info } from "lucide-react";

const CONCEPT_TYPES = [
  "Fast Casual",
  "Casual Dining",
  "Premium Casual",
  "Fine Dining",
  "Bar Lounge",
  "Nightclub",
] as const;

// Map database concept types to display names
const CONCEPT_TYPE_MAP: Record<string, string> = {
  "fast-casual": "Fast Casual",
  "casual-dining": "Casual Dining",
  "premium-casual": "Premium Casual",
  "fine-dining": "Fine Dining",
  "bar-lounge": "Bar Lounge",
  "nightclub": "Nightclub",
};

interface LaborAssumptionsProps {
  scenarioId: string;
  assumptions?: any;
  conceptType: string; // from proforma_projects.concept_type
}

export function LaborAssumptions({
  scenarioId,
  assumptions,
  conceptType,
}: LaborAssumptionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salariedRoles, setSalariedRoles] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [benchmarks, setBenchmarks] = useState<any>(null);
  const [showPositions, setShowPositions] = useState(false);
  const [positionMix, setPositionMix] = useState<{ foh: any[]; boh: any[] }>({ foh: [], boh: [] });
  const [useManualOverride, setUseManualOverride] = useState(false);
  const [useDifferentConcept, setUseDifferentConcept] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<string>("");

  // Convert kebab-case to title case for display
  const displayConcept = CONCEPT_TYPE_MAP[conceptType] || "Casual Dining";

  // Use selected concept if override is enabled, otherwise use project concept
  const activeConcept = useDifferentConcept && selectedConcept ? selectedConcept : displayConcept;

  const [formData, setFormData] = useState({
    foh_hours_per_100_covers: assumptions?.foh_hours_per_100_covers || 30,
    boh_hours_per_100_covers: assumptions?.boh_hours_per_100_covers || 32,
    foh_hourly_rate: assumptions?.foh_hourly_rate || 22,
    boh_hourly_rate: assumptions?.boh_hourly_rate || 24,
    payroll_burden_pct: assumptions?.payroll_burden_pct ? assumptions.payroll_burden_pct * 100 : 25,
  });

  const [coreManagement, setCoreManagement] = useState<any[]>([
    { role_name: "GM Salary", annual_salary: assumptions?.gm_salary_annual || 90000 },
    { role_name: "AGM Salary", annual_salary: assumptions?.agm_salary_annual || 65000 },
    { role_name: "KM Salary", annual_salary: assumptions?.km_salary_annual || 75000 },
  ]);

  const [newRole, setNewRole] = useState({
    role_name: "",
    annual_salary: "",
    start_month: "1",
    end_month: "",
  });

  // Load benchmarks when active concept changes
  useEffect(() => {
    if (activeConcept) {
      loadBenchmarks(activeConcept);
      loadPositionMix(activeConcept);
    }
  }, [activeConcept]);

  // Load salaried roles
  useEffect(() => {
    loadSalariedRoles();
  }, [scenarioId]);

  const loadBenchmarks = async (concept: string) => {
    try {
      const response = await fetch(`/api/proforma/labor-benchmarks?concept=${encodeURIComponent(concept)}`);
      if (response.ok) {
        const data = await response.json();
        setBenchmarks(data.benchmarks);

        // Auto-apply benchmarks to inputs if not using manual override
        if (data.benchmarks && !useManualOverride) {
          setFormData(prev => ({
            ...prev,
            foh_hours_per_100_covers: data.benchmarks.foh_hours_per_100,
            boh_hours_per_100_covers: data.benchmarks.boh_hours_per_100,
            foh_hourly_rate: data.benchmarks.foh_blended_rate,
            boh_hourly_rate: data.benchmarks.boh_blended_rate,
          }));
        }
      }
    } catch (error) {
      console.error("Error loading benchmarks:", error);
    }
  };

  const loadPositionMix = async (concept: string) => {
    try {
      const response = await fetch(`/api/proforma/labor-position-mix?concept=${encodeURIComponent(concept)}`);
      if (response.ok) {
        const data = await response.json();
        setPositionMix(data);
      }
    } catch (error) {
      console.error("Error loading position mix:", error);
    }
  };

  const applyBenchmarks = () => {
    if (!benchmarks) return;

    setFormData({
      ...formData,
      foh_hours_per_100_covers: benchmarks.foh_hours_per_100,
      boh_hours_per_100_covers: benchmarks.boh_hours_per_100,
      foh_hourly_rate: benchmarks.foh_blended_rate,
      boh_hourly_rate: benchmarks.boh_blended_rate,
    });
  };

  const loadSalariedRoles = async () => {
    try {
      const response = await fetch(
        `/api/proforma/salaried-roles?scenario_id=${scenarioId}`
      );
      if (response.ok) {
        const data = await response.json();
        setSalariedRoles(data.roles || []);
      }
    } catch (error) {
      console.error("Error loading salaried roles:", error);
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/proforma/assumptions/labor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          foh_hours_per_100_covers: formData.foh_hours_per_100_covers,
          boh_hours_per_100_covers: formData.boh_hours_per_100_covers,
          foh_hourly_rate: formData.foh_hourly_rate,
          boh_hourly_rate: formData.boh_hourly_rate,
          gm_salary_annual: coreManagement[0]?.annual_salary || 0,
          agm_salary_annual: coreManagement[1]?.annual_salary || 0,
          km_salary_annual: coreManagement[2]?.annual_salary || 0,
          payroll_burden_pct: formData.payroll_burden_pct / 100,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save assumptions");
      }

      router.refresh();
      alert("Labor assumptions saved successfully");
    } catch (error) {
      console.error("Error saving assumptions:", error);
      alert("Failed to save assumptions");
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = async () => {
    if (!newRole.role_name || !newRole.annual_salary) {
      alert("Please enter role name and salary");
      return;
    }

    try {
      const response = await fetch("/api/proforma/salaried-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: scenarioId,
          role_name: newRole.role_name,
          annual_salary: parseFloat(newRole.annual_salary),
          start_month: parseInt(newRole.start_month),
          end_month: newRole.end_month ? parseInt(newRole.end_month) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add role");
      }

      setNewRole({
        role_name: "",
        annual_salary: "",
        start_month: "1",
        end_month: "",
      });

      loadSalariedRoles();
    } catch (error) {
      console.error("Error adding role:", error);
      alert("Failed to add role");
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Delete this role?")) return;

    try {
      const response = await fetch(
        `/api/proforma/salaried-roles?id=${roleId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete role");
      }

      loadSalariedRoles();
    } catch (error) {
      console.error("Error deleting role:", error);
      alert("Failed to delete role");
    }
  };

  const totalHoursPer100 = formData.foh_hours_per_100_covers + formData.boh_hours_per_100_covers;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-2">
          Labor Assumptions
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          Productivity-based labor model (not % of sales). Covers drive everything.
        </p>

        {/* Concept Display */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-zinc-300">
                  Labor Benchmarks
                </Label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useDifferentConcept}
                      onChange={(e) => {
                        setUseDifferentConcept(e.target.checked);
                        if (!e.target.checked) {
                          setSelectedConcept("");
                        } else {
                          setSelectedConcept(displayConcept);
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span className="text-xs text-zinc-400">Use Different Concept</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useManualOverride}
                      onChange={(e) => {
                        setUseManualOverride(e.target.checked);
                        // If turning off override, re-apply benchmarks
                        if (!e.target.checked && benchmarks) {
                          setFormData(prev => ({
                            ...prev,
                            foh_hours_per_100_covers: benchmarks.foh_hours_per_100,
                            boh_hours_per_100_covers: benchmarks.boh_hours_per_100,
                            foh_hourly_rate: benchmarks.foh_blended_rate,
                            boh_hourly_rate: benchmarks.boh_blended_rate,
                          }));
                        }
                      }}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span className="text-xs text-zinc-400">Override Benchmarks</span>
                  </label>
                </div>
              </div>

              {!useDifferentConcept ? (
                <>
                  <div className="mt-1 w-full bg-zinc-950/50 border border-zinc-700 rounded px-3 py-2 text-zinc-100">
                    {displayConcept}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Using project concept type
                  </p>
                </>
              ) : (
                <>
                  <select
                    value={selectedConcept}
                    onChange={(e) => setSelectedConcept(e.target.value)}
                    className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
                  >
                    {CONCEPT_TYPES.map((concept) => (
                      <option key={concept} value={concept}>
                        {concept}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-500 mt-1">
                    Project is <span className="text-zinc-300">{displayConcept}</span>, using <span className="text-[#D4AF37]">{selectedConcept}</span> benchmarks
                  </p>
                </>
              )}
            </div>
            <div className="flex-1">
              {benchmarks && (
                <div className="bg-zinc-950/50 rounded p-3 border border-zinc-800">
                  <p className="text-xs font-medium text-zinc-400 mb-2">Benchmarks for {activeConcept}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-300">
                    <div>FOH: {benchmarks.foh_hours_per_100} hrs/100</div>
                    <div>@ ${benchmarks.foh_blended_rate}/hr</div>
                    <div>BOH: {benchmarks.boh_hours_per_100} hrs/100</div>
                    <div>@ ${benchmarks.boh_blended_rate}/hr</div>
                    <div className="col-span-2 text-[#D4AF37] font-medium mt-1">
                      Total: {(parseFloat(benchmarks.foh_hours_per_100) + parseFloat(benchmarks.boh_hours_per_100)).toFixed(0)} hrs/100
                    </div>
                    <div className="col-span-2 text-zinc-500 mt-1">
                      Target Labor %: {benchmarks.labor_pct_min}–{benchmarks.labor_pct_max}%
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={applyBenchmarks}
                    className="w-full mt-3 text-xs"
                  >
                    Apply These Benchmarks
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Productivity (Aggregated View) */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-medium text-zinc-300">Productivity (Hours per 100 Covers)</h4>
          <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400">
            Aggregated View
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="foh_hours_per_100_covers" className="text-sm">
              FOH Hours / 100 Covers *
            </Label>
            <Input
              id="foh_hours_per_100_covers"
              type="number"
              step="0.1"
              value={formData.foh_hours_per_100_covers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  foh_hours_per_100_covers: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="boh_hours_per_100_covers" className="text-sm">
              BOH Hours / 100 Covers *
            </Label>
            <Input
              id="boh_hours_per_100_covers"
              type="number"
              step="0.1"
              value={formData.boh_hours_per_100_covers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  boh_hours_per_100_covers: parseFloat(e.target.value),
                })
              }
              required
            />
          </div>
          <div className="flex items-end">
            <div className="w-full p-3 bg-zinc-900/50 border border-zinc-800 rounded">
              <div className="text-xs text-zinc-500">Total hrs/100</div>
              <div className="text-lg font-semibold text-[#D4AF37]">
                {totalHoursPer100.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Position-Level Detail (Optional) */}
      {showPositions && (
        <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-medium text-zinc-300">Position-Level Detail</h4>
              <p className="text-xs text-zinc-500 mt-1">
                Position breakdown by three labor types: Volume-Elastic, Presence-Required, and Threshold
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPositions(false)}
              className="text-xs"
            >
              Hide Detail
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* FOH Positions */}
            <div>
              <h5 className="text-xs font-semibold text-zinc-400 mb-3">FOH Labor</h5>

              {/* Class 1: Volume-Elastic */}
              <div className="mb-4">
                <div className="text-xs text-blue-400 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  Class 1: Volume-Elastic
                </div>
                <div className="space-y-1">
                  {positionMix.foh.filter((p: any) => p.labor_driver_type === 'VOLUME').map((pos: any) => (
                    <div
                      key={pos.position_name}
                      className="flex items-center justify-between text-xs bg-zinc-900/50 border border-zinc-800 rounded px-2 py-1.5"
                    >
                      <span className="text-zinc-300">{pos.position_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500">${pos.hourly_rate}/hr</span>
                        <span className="font-medium text-[#D4AF37] w-12 text-right">
                          {pos.position_mix_pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-zinc-700 mt-1.5 pt-1.5 flex justify-between text-xs font-semibold">
                    <span className="text-zinc-400">Volume Total</span>
                    <span className="text-[#D4AF37]">100%</span>
                  </div>
                </div>
              </div>

              {/* Class 2: Presence-Required */}
              {positionMix.foh.some((p: any) => p.labor_driver_type === 'PRESENCE') && (
                <div className="mb-4">
                  <div className="text-xs text-green-400 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                    Class 2: Presence-Required
                  </div>
                  <div className="space-y-1">
                    {positionMix.foh.filter((p: any) => p.labor_driver_type === 'PRESENCE').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-green-950/20 border border-green-900/30 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-300">{pos.position_name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500">{pos.staff_per_service}×{pos.hours_per_shift}hr @ ${pos.hourly_rate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Class 3: Threshold */}
              {positionMix.foh.some((p: any) => p.labor_driver_type === 'THRESHOLD') && (
                <div>
                  <div className="text-xs text-amber-400 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Class 3: Threshold
                  </div>
                  <div className="space-y-1">
                    {positionMix.foh.filter((p: any) => p.labor_driver_type === 'THRESHOLD').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-amber-950/20 border border-amber-900/30 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-300">{pos.position_name}</span>
                        <div className="text-xs text-zinc-500">
                          After {pos.cover_threshold} cvrs
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* BOH Positions */}
            <div>
              <h5 className="text-xs font-semibold text-zinc-400 mb-3">BOH Labor</h5>

              {/* Class 1: Volume-Elastic */}
              <div className="mb-4">
                <div className="text-xs text-blue-400 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  Class 1: Volume-Elastic
                </div>
                <div className="space-y-1">
                  {positionMix.boh.filter((p: any) => p.labor_driver_type === 'VOLUME').map((pos: any) => (
                    <div
                      key={pos.position_name}
                      className="flex items-center justify-between text-xs bg-zinc-900/50 border border-zinc-800 rounded px-2 py-1.5"
                    >
                      <span className="text-zinc-300">{pos.position_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500">${pos.hourly_rate}/hr</span>
                        <span className="font-medium text-[#D4AF37] w-12 text-right">
                          {pos.position_mix_pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-zinc-700 mt-1.5 pt-1.5 flex justify-between text-xs font-semibold">
                    <span className="text-zinc-400">Volume Total</span>
                    <span className="text-[#D4AF37]">100%</span>
                  </div>
                </div>
              </div>

              {/* Class 2: Presence-Required */}
              {positionMix.boh.some((p: any) => p.labor_driver_type === 'PRESENCE') && (
                <div className="mb-4">
                  <div className="text-xs text-green-400 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                    Class 2: Presence-Required
                  </div>
                  <div className="space-y-1">
                    {positionMix.boh.filter((p: any) => p.labor_driver_type === 'PRESENCE').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-green-950/20 border border-green-900/30 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-300">{pos.position_name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500">{pos.staff_per_service}×{pos.hours_per_shift}hr @ ${pos.hourly_rate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Class 3: Threshold */}
              {positionMix.boh.some((p: any) => p.labor_driver_type === 'THRESHOLD') && (
                <div>
                  <div className="text-xs text-amber-400 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Class 3: Threshold
                  </div>
                  <div className="space-y-1">
                    {positionMix.boh.filter((p: any) => p.labor_driver_type === 'THRESHOLD').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-amber-950/20 border border-amber-900/30 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-300">{pos.position_name}</span>
                        <div className="text-xs text-zinc-500">
                          After {pos.cover_threshold} cvrs
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-zinc-950/50 border border-zinc-800 rounded text-xs space-y-2">
            <p className="text-zinc-400">
              <Info className="inline w-3 h-3 mr-1" />
              <strong>Three-tier labor classification:</strong>
            </p>
            <div className="grid grid-cols-3 gap-3 text-zinc-400">
              <div>
                <div className="text-blue-400 font-medium mb-1">Volume-Elastic</div>
                <div>Scales with covers. Example: 90 FOH hrs × 45% = 40.5 server hrs</div>
              </div>
              <div>
                <div className="text-green-400 font-medium mb-1">Presence-Required</div>
                <div>Fixed per active service. Example: 2 security × 6 hrs when service is on</div>
              </div>
              <div>
                <div className="text-amber-400 font-medium mb-1">Threshold</div>
                <div>Kicks in after volume threshold. Example: +1 maître d' after 250 covers</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showPositions && (
        <div className="flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowPositions(true)}
            className="text-xs text-zinc-400"
          >
            <Plus className="w-3 h-3 mr-1" />
            Show Position-Level Detail
          </Button>
        </div>
      )}

      {/* Hourly Rates (Blended) */}
      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Blended Hourly Rates</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="foh_hourly_rate" className="text-sm">FOH Blended Rate *</Label>
            <Input
              id="foh_hourly_rate"
              type="number"
              step="0.1"
              value={formData.foh_hourly_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  foh_hourly_rate: parseFloat(e.target.value),
                })
              }
              required
            />
            <p className="text-xs text-zinc-500 mt-1">
              Weighted average across servers, hosts, bartenders, etc.
            </p>
          </div>
          <div>
            <Label htmlFor="boh_hourly_rate" className="text-sm">BOH Blended Rate *</Label>
            <Input
              id="boh_hourly_rate"
              type="number"
              step="0.1"
              value={formData.boh_hourly_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  boh_hourly_rate: parseFloat(e.target.value),
                })
              }
              required
            />
            <p className="text-xs text-zinc-500 mt-1">
              Weighted average across line, prep, dish, etc.
            </p>
          </div>
        </div>
      </div>

      {/* Core Management Salaries */}
      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Core Management Salaries (Annual)
        </h4>
        <div className="space-y-2">
          {coreManagement.map((mgmt, index) => (
            <div key={index} className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <Input
                  value={mgmt.role_name}
                  onChange={(e) => {
                    const updated = [...coreManagement];
                    updated[index].role_name = e.target.value;
                    setCoreManagement(updated);
                  }}
                  placeholder="Role Name"
                />
              </div>
              <div className="col-span-5">
                <Input
                  type="number"
                  step="1000"
                  value={mgmt.annual_salary}
                  onChange={(e) => {
                    const updated = [...coreManagement];
                    updated[index].annual_salary = parseFloat(e.target.value);
                    setCoreManagement(updated);
                  }}
                  placeholder="Annual Salary"
                />
              </div>
              <div className="col-span-2 flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const updated = coreManagement.filter((_, i) => i !== index);
                    setCoreManagement(updated);
                  }}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCoreManagement([
                ...coreManagement,
                { role_name: "", annual_salary: 0 },
              ]);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Management Position
          </Button>
        </div>
      </div>

      {/* Additional Salaried Roles */}
      <div className="border-t border-zinc-800 pt-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">
          Additional Salaried Roles
        </h4>
        <p className="text-xs text-zinc-500 mb-4">
          Add security, sous chef, bar manager, etc. with custom start/end months
        </p>

        {/* Existing roles table */}
        {!loadingRoles && salariedRoles.length > 0 && (
          <div className="mb-4 border border-zinc-800 rounded">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/50">
                <tr>
                  <th className="text-left p-2 text-zinc-400">Role</th>
                  <th className="text-left p-2 text-zinc-400">Annual Salary</th>
                  <th className="text-left p-2 text-zinc-400">Start Month</th>
                  <th className="text-left p-2 text-zinc-400">End Month</th>
                  <th className="text-left p-2 text-zinc-400"></th>
                </tr>
              </thead>
              <tbody>
                {salariedRoles.map((role) => (
                  <tr key={role.id} className="border-t border-zinc-800">
                    <td className="p-2 text-zinc-300">{role.role_name}</td>
                    <td className="p-2 text-zinc-300">
                      ${role.annual_salary.toLocaleString()}
                    </td>
                    <td className="p-2 text-zinc-300">{role.start_month}</td>
                    <td className="p-2 text-zinc-300">
                      {role.end_month || "Always"}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add new role */}
        <div className="grid grid-cols-5 gap-2">
          <div>
            <Label htmlFor="new_role_name" className="text-xs">
              Role Name
            </Label>
            <Input
              id="new_role_name"
              value={newRole.role_name}
              onChange={(e) =>
                setNewRole({ ...newRole, role_name: e.target.value })
              }
              placeholder="Security Manager"
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new_role_salary" className="text-xs">
              Annual Salary
            </Label>
            <Input
              id="new_role_salary"
              type="number"
              step="1000"
              value={newRole.annual_salary}
              onChange={(e) =>
                setNewRole({ ...newRole, annual_salary: e.target.value })
              }
              placeholder="60000"
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new_role_start" className="text-xs">
              Start Month
            </Label>
            <Input
              id="new_role_start"
              type="number"
              min="1"
              value={newRole.start_month}
              onChange={(e) =>
                setNewRole({ ...newRole, start_month: e.target.value })
              }
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="new_role_end" className="text-xs">
              End Month
            </Label>
            <Input
              id="new_role_end"
              type="number"
              min="1"
              value={newRole.end_month}
              onChange={(e) =>
                setNewRole({ ...newRole, end_month: e.target.value })
              }
              placeholder="Optional"
              className="text-sm"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={handleAddRole} size="sm" className="w-full">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Payroll Burden */}
      <div className="border-t border-zinc-800 pt-4">
        <Label htmlFor="payroll_burden_pct" className="text-sm">Payroll Burden % *</Label>
        <Input
          id="payroll_burden_pct"
          type="number"
          step="0.1"
          value={formData.payroll_burden_pct}
          onChange={(e) =>
            setFormData({
              ...formData,
              payroll_burden_pct: parseFloat(e.target.value),
            })
          }
          required
          className="mt-1"
        />
        <p className="text-xs text-zinc-500 mt-1">
          Taxes, benefits, workers comp, etc. as % of gross wages (typically 20-30%)
        </p>
      </div>

      <div className="flex justify-end pt-4 border-t border-zinc-800">
        <Button type="submit" disabled={loading}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save Labor Assumptions"}
        </Button>
      </div>
    </form>
  );
}
