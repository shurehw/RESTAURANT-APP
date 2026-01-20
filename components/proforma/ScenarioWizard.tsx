"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { calculatePositionRate } from "@/lib/labor-rate-calculator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Check, AlertTriangle } from "lucide-react";
import {
  SEATING_BENCHMARKS,
  CONCEPT_TYPES,
  calculateSeats,
  validateSpaceConstraints,
  type ValidationResult,
} from "@/lib/proforma/constants";

interface ScenarioWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface ServicePeriod {
  service_name: string;
  days_per_week: number;
  avg_covers_per_service: number;
  avg_food_check: number;
  avg_bev_check: number;
}

interface PDR {
  room_name: string;
  capacity: number;
  events_per_month: number;
  avg_spend_per_person: number;
  avg_party_size: number;
  ramp_months: number;
  food_pct: number;
  bev_pct: number;
  other_pct: number;
}

export function ScenarioWizard({ open, onOpenChange, projectId }: ScenarioWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Basic Info + Scenario
  const [basicInfo, setBasicInfo] = useState({
    scenarioName: "Base Case",
    months: 60,
    start_month: new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
  });

  // Step 2: Space Planning
  const [spacePlanning, setSpacePlanning] = useState({
    conceptType: "casual-dining",
    densityBenchmark: "casual-dining", // Independent density selection
    totalSF: 0,
    sfPerSeat: 20,
    diningAreaPct: 65,
    bohPct: 30,
    monthlyRent: 0,
    useManualSeats: false,
    manualSeats: 0,
    useManualSplits: false,
    manualFOH: 0,
    manualBOH: 0,
  });
  const [spaceValidation, setSpaceValidation] = useState<ValidationResult>({
    valid: true,
    warnings: [],
    errors: [],
  });

  // Step 3: Service Periods
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [newService, setNewService] = useState<ServicePeriod>({
    service_name: "",
    days_per_week: 7,
    avg_covers_per_service: 0,
    avg_food_check: 0,
    avg_bev_check: 0,
  });

  // Step 4: Private Dining
  const [pdrs, setPdrs] = useState<PDR[]>([]);
  const [newPDR, setNewPDR] = useState<PDR>({
    room_name: "",
    capacity: 20,
    events_per_month: 8,
    avg_spend_per_person: 150,
    avg_party_size: 15,
    ramp_months: 12,
    food_pct: 60,
    bev_pct: 35,
    other_pct: 5,
  });

  // Step 5: Labor Positions
  const [laborWages, setLaborWages] = useState({
    minWageCity: 15.00,
    tipCredit: 0.00,
    marketTier: "MID" as "LOW" | "MID" | "HIGH",
  });
  const [positionTemplates, setPositionTemplates] = useState<any[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);

  const handleAddService = () => {
    if (!newService.service_name) {
      alert("Please enter a service name");
      return;
    }
    setServices([...services, newService]);
    setNewService({
      service_name: "",
      days_per_week: 7,
      avg_covers_per_service: 0,
      avg_food_check: 0,
      avg_bev_check: 0,
    });
  };

  const handleRemoveService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleAddPDR = () => {
    if (!newPDR.room_name) {
      alert("Please enter a room name");
      return;
    }
    const mixSum = newPDR.food_pct + newPDR.bev_pct + newPDR.other_pct;
    if (Math.abs(mixSum - 100) > 0.1) {
      alert("Food + Bev + Other must sum to 100%");
      return;
    }
    setPdrs([...pdrs, newPDR]);
    setNewPDR({
      room_name: "",
      capacity: 20,
      events_per_month: 8,
      avg_spend_per_person: 150,
      avg_party_size: 15,
      ramp_months: 12,
      food_pct: 60,
      bev_pct: 35,
      other_pct: 5,
    });
  };

  const handleRemovePDR = (index: number) => {
    setPdrs(pdrs.filter((_, i) => i !== index));
  };

  // Load position templates when reaching step 5
  useEffect(() => {
    if (step === 5 && positionTemplates.length === 0) {
      loadPositionTemplates();
    }
  }, [step]);

  const loadPositionTemplates = async () => {
    setLoadingPositions(true);
    try {
      const conceptType = CONCEPT_TYPES.find(c => c.value === spacePlanning.conceptType)?.label || "Casual Dining";
      const response = await fetch(`/api/proforma/labor-position-mix?concept=${encodeURIComponent(conceptType)}`);

      if (response.ok) {
        const data = await response.json();
        // Combine FOH and BOH, filter VOLUME positions only
        const allPositions = [...(data.foh || []), ...(data.boh || [])].filter(
          (p: any) => p.labor_driver_type === 'VOLUME'
        );
        setPositionTemplates(allPositions);

        // Pre-select all positions by default
        setSelectedPositions(allPositions.map((p: any) => p.position_name));
      }
    } catch (error) {
      console.error("Failed to load position templates:", error);
    } finally {
      setLoadingPositions(false);
    }
  };

  const togglePosition = (positionName: string) => {
    if (selectedPositions.includes(positionName)) {
      setSelectedPositions(selectedPositions.filter(p => p !== positionName));
    } else {
      setSelectedPositions([...selectedPositions, positionName]);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!basicInfo.scenarioName) {
        alert("Please enter a scenario name");
        return;
      }
    }
    if (step === 2) {
      // Validate space planning
      const finalSeats = spacePlanning.useManualSeats
        ? spacePlanning.manualSeats
        : spacePlanning.totalSF > 0
        ? calculateSeats(spacePlanning.totalSF, spacePlanning.diningAreaPct, spacePlanning.sfPerSeat)
        : 0;

      const rentPerSeat = finalSeats > 0 ? spacePlanning.monthlyRent / finalSeats : 0;

      const validation = validateSpaceConstraints({
        totalSF: spacePlanning.totalSF,
        sfPerSeat: spacePlanning.useManualSeats ? 0 : spacePlanning.sfPerSeat, // Skip validation if manual
        bohPct: spacePlanning.useManualSplits ? 0 : spacePlanning.bohPct, // Skip validation if manual
        rentPerSeatPerMonth: rentPerSeat,
        conceptType: spacePlanning.densityBenchmark, // Use density benchmark for validation
      });

      setSpaceValidation(validation);

      if (!validation.valid) {
        return;
      }
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      // 1. Update project with space planning data
      const projectUpdateRes = await fetch(`/api/proforma/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept_type: spacePlanning.conceptType,
          density_benchmark: spacePlanning.densityBenchmark,
          total_sf: spacePlanning.totalSF,
          sf_per_seat: spacePlanning.sfPerSeat,
          dining_area_pct: spacePlanning.diningAreaPct,
          boh_pct: spacePlanning.bohPct,
          monthly_rent: spacePlanning.monthlyRent,
          use_manual_seats: spacePlanning.useManualSeats,
          manual_seats: spacePlanning.manualSeats,
          use_manual_splits: spacePlanning.useManualSplits,
          square_feet_foh: spacePlanning.useManualSplits ? spacePlanning.manualFOH : null,
          square_feet_boh: spacePlanning.useManualSplits ? spacePlanning.manualBOH : null,
        }),
      });

      if (!projectUpdateRes.ok) throw new Error("Failed to update project");

      // 2. Create scenario with labor wage parameters
      const scenarioRes = await fetch("/api/proforma/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          name: basicInfo.scenarioName,
          months: basicInfo.months,
          start_month: basicInfo.start_month,
          is_base: true,
          min_wage_city: laborWages.minWageCity,
          tip_credit: laborWages.tipCredit,
          market_tier: laborWages.marketTier,
        }),
      });

      if (!scenarioRes.ok) throw new Error("Failed to create scenario");
      const { scenario } = await scenarioRes.json();

      // 3. Add service periods
      for (let i = 0; i < services.length; i++) {
        await fetch("/api/proforma/service-periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            ...services[i],
            sort_order: i,
          }),
        });
      }

      // 4. Add PDRs
      for (const pdr of pdrs) {
        await fetch("/api/proforma/pdr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            ...pdr,
            // Convert to 0-1 decimals
            food_pct: pdr.food_pct / 100,
            bev_pct: pdr.bev_pct / 100,
            other_pct: pdr.other_pct / 100,
          }),
        });
      }

      // 5. Add selected labor positions with calculated rates
      for (const positionName of selectedPositions) {
        const template = positionTemplates.find(p => p.position_name === positionName);
        if (!template) continue;

        const calculatedRate = calculatePositionRate(
          {
            minWageCity: laborWages.minWageCity,
            tipCredit: laborWages.tipCredit,
            marketTier: laborWages.marketTier,
          },
          {
            wage_multiplier: template.wage_multiplier,
            is_tipped: template.is_tipped,
          }
        );

        await fetch("/api/proforma/labor-positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario_id: scenario.id,
            position_name: template.position_name,
            category: template.category,
            labor_driver_type: template.labor_driver_type,
            hours_per_100_covers: template.hours_per_100_covers,
            position_mix_pct: template.position_mix_pct,
            hourly_rate: calculatedRate,
            staff_per_service: template.staff_per_service,
            hours_per_shift: template.hours_per_shift,
            cover_threshold: template.cover_threshold,
          }),
        });
      }

      onOpenChange(false);
      router.refresh();
      router.push(`/proforma/${projectId}`);
    } catch (error) {
      console.error("Error creating scenario:", error);
      alert("Failed to create scenario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Scenario Setup</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-between text-xs">
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= 1 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                1
              </div>
              <span className="font-medium">Scenario</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= 2 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                2
              </div>
              <span className="font-medium">Space</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 3 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= 3 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                3
              </div>
              <span className="font-medium">Services</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 4 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= 4 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                4
              </div>
              <span className="font-medium">PDR</span>
            </div>
            <div className="flex-1 h-px bg-zinc-800 mx-2" />
            <div className={`flex items-center gap-2 ${step >= 5 ? "text-[#D4AF37]" : "text-zinc-600"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= 5 ? "bg-[#D4AF37] text-black" : "bg-zinc-800"}`}>
                5
              </div>
              <span className="font-medium">Labor</span>
            </div>
          </div>

          {/* Step 1: Scenario Setup */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Scenario Setup</h3>
                <p className="text-sm text-zinc-400 mt-1">Configure your projection timeline and scenario name</p>
              </div>

              <div>
                <Label htmlFor="scenarioName">Scenario Name *</Label>
                <Input
                  id="scenarioName"
                  value={basicInfo.scenarioName}
                  onChange={(e) => setBasicInfo({ ...basicInfo, scenarioName: e.target.value })}
                  placeholder="Base Case, Upside, Downside"
                />
                <p className="text-xs text-zinc-500 mt-1">This will be your primary financial model</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="months">Projection Period (Months) *</Label>
                  <Input
                    id="months"
                    type="number"
                    min="12"
                    max="120"
                    value={basicInfo.months}
                    onChange={(e) => setBasicInfo({ ...basicInfo, months: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-zinc-500 mt-1">Typically 60 months (5 years)</p>
                </div>
                <div>
                  <Label htmlFor="start_month">Start Month *</Label>
                  <Input
                    id="start_month"
                    type="date"
                    value={basicInfo.start_month}
                    onChange={(e) => setBasicInfo({ ...basicInfo, start_month: e.target.value })}
                  />
                  <p className="text-xs text-zinc-500 mt-1">Projected opening date</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Space Planning */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Space Planning</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Define your space parameters and get benchmark-driven seat count estimates
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="conceptType">Concept Type</Label>
                  <Select
                    value={spacePlanning.conceptType}
                    onValueChange={(value) => setSpacePlanning({ ...spacePlanning, conceptType: value })}
                  >
                    <SelectTrigger id="conceptType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONCEPT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="densityBenchmark">Seating Density Benchmark</Label>
                  <Select
                    value={spacePlanning.densityBenchmark}
                    onValueChange={(value) => {
                      const benchmark = SEATING_BENCHMARKS[value];
                      const avgSFPerSeat = benchmark ? (benchmark.sfPerSeat[0] + benchmark.sfPerSeat[1]) / 2 : 20;
                      const avgDiningPct = benchmark ? (benchmark.diningAreaPct[0] + benchmark.diningAreaPct[1]) / 2 : 65;
                      setSpacePlanning({
                        ...spacePlanning,
                        densityBenchmark: value,
                        sfPerSeat: avgSFPerSeat,
                        diningAreaPct: avgDiningPct,
                      });
                    }}
                  >
                    <SelectTrigger id="densityBenchmark">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONCEPT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="totalSF">Total Square Feet</Label>
                  <Input
                    id="totalSF"
                    type="number"
                    min="0"
                    value={spacePlanning.totalSF || ""}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, totalSF: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="monthlyRent">Monthly Rent ($)</Label>
                  <Input
                    id="monthlyRent"
                    type="number"
                    min="0"
                    value={spacePlanning.monthlyRent || ""}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, monthlyRent: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {spacePlanning.densityBenchmark && SEATING_BENCHMARKS[spacePlanning.densityBenchmark] && (
                <Card className="p-4 bg-zinc-900/50 border-zinc-800">
                  <div className="text-xs text-zinc-400 space-y-2">
                    <div className="font-semibold text-zinc-300 mb-2">Industry Benchmarks ({CONCEPT_TYPES.find(t => t.value === spacePlanning.densityBenchmark)?.label}):</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-zinc-500">SF/Seat:</span>{" "}
                        <span className="text-[#D4AF37]">
                          {SEATING_BENCHMARKS[spacePlanning.densityBenchmark].sfPerSeat.join("–")}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Seats/1K SF:</span>{" "}
                        <span className="text-[#D4AF37]">
                          {SEATING_BENCHMARKS[spacePlanning.densityBenchmark].seatsPerThousandSF.join("–")}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Dining %:</span>{" "}
                        <span className="text-[#D4AF37]">
                          {SEATING_BENCHMARKS[spacePlanning.densityBenchmark].diningAreaPct.join("–")}%
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="sfPerSeat">SF per Seat</Label>
                  <Input
                    id="sfPerSeat"
                    type="number"
                    step="0.1"
                    min="0"
                    value={spacePlanning.sfPerSeat}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, sfPerSeat: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="diningAreaPct">Dining Area %</Label>
                  <Input
                    id="diningAreaPct"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={spacePlanning.diningAreaPct}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, diningAreaPct: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="bohPct">BOH %</Label>
                  <Input
                    id="bohPct"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={spacePlanning.bohPct}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, bohPct: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Manual Overrides Toggle */}
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spacePlanning.useManualSeats}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, useManualSeats: e.target.checked })}
                    className="rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <span className="text-sm text-zinc-300">Manual Seat Count</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={spacePlanning.useManualSplits}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, useManualSplits: e.target.checked })}
                    className="rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <span className="text-sm text-zinc-300">Manual FOH/BOH Split</span>
                </label>
              </div>

              {/* Manual Seats Override */}
              {spacePlanning.useManualSeats && (
                <Card className="p-4 bg-zinc-900/50 border-[#D4AF37]/30">
                  <Label htmlFor="manualSeats">Manual Seat Count</Label>
                  <Input
                    id="manualSeats"
                    type="number"
                    min="0"
                    value={spacePlanning.manualSeats || ""}
                    onChange={(e) => setSpacePlanning({ ...spacePlanning, manualSeats: parseInt(e.target.value) || 0 })}
                    className="mt-2"
                  />
                </Card>
              )}

              {/* Manual FOH/BOH Split Override */}
              {spacePlanning.useManualSplits && (
                <Card className="p-4 bg-zinc-900/50 border-[#D4AF37]/30">
                  <div className="space-y-3">
                    <Label>Manual FOH/BOH Split (SF)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="manualFOH" className="text-xs text-zinc-400">Front of House SF</Label>
                        <Input
                          id="manualFOH"
                          type="number"
                          min="0"
                          value={spacePlanning.manualFOH || ""}
                          onChange={(e) => setSpacePlanning({ ...spacePlanning, manualFOH: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="manualBOH" className="text-xs text-zinc-400">Back of House SF</Label>
                        <Input
                          id="manualBOH"
                          type="number"
                          min="0"
                          value={spacePlanning.manualBOH || ""}
                          onChange={(e) => setSpacePlanning({ ...spacePlanning, manualBOH: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    {spacePlanning.manualFOH > 0 && spacePlanning.manualBOH > 0 && (
                      <div className="text-xs text-zinc-400 pt-1">
                        Total: {spacePlanning.manualFOH + spacePlanning.manualBOH} SF
                        ({((spacePlanning.manualFOH / (spacePlanning.manualFOH + spacePlanning.manualBOH)) * 100).toFixed(1)}% FOH / {((spacePlanning.manualBOH / (spacePlanning.manualFOH + spacePlanning.manualBOH)) * 100).toFixed(1)}% BOH)
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Calculated Capacity Display */}
              {spacePlanning.totalSF > 0 && (
                <Card className="p-4 bg-zinc-900 border-[#D4AF37]/30">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-[#D4AF37]">
                      {spacePlanning.useManualSeats ? "Manual" : "Calculated"} Capacity
                    </div>
                    <div className="text-2xl font-bold text-zinc-50">
                      {spacePlanning.useManualSeats
                        ? spacePlanning.manualSeats
                        : calculateSeats(spacePlanning.totalSF, spacePlanning.diningAreaPct, spacePlanning.sfPerSeat)} seats
                    </div>
                    {spacePlanning.monthlyRent > 0 && (
                      <div className="text-sm text-zinc-400">
                        Rent/Seat/Month: $
                        {spacePlanning.useManualSeats && spacePlanning.manualSeats > 0
                          ? (spacePlanning.monthlyRent / spacePlanning.manualSeats).toFixed(2)
                          : (spacePlanning.monthlyRent / calculateSeats(spacePlanning.totalSF, spacePlanning.diningAreaPct, spacePlanning.sfPerSeat)).toFixed(2)}
                      </div>
                    )}
                    {spacePlanning.useManualSplits && spacePlanning.manualFOH > 0 && spacePlanning.manualBOH > 0 && (
                      <div className="text-sm text-zinc-400 pt-2 border-t border-zinc-800">
                        FOH: {spacePlanning.manualFOH.toLocaleString()} SF | BOH: {spacePlanning.manualBOH.toLocaleString()} SF
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {(spaceValidation.errors.length > 0 || spaceValidation.warnings.length > 0) && (
                <div className="space-y-2">
                  {spaceValidation.errors.map((error, i) => (
                    <Card key={`error-${i}`} className="p-3 bg-red-950/30 border-red-800/50">
                      <div className="flex items-start gap-2 text-sm text-red-400">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    </Card>
                  ))}
                  {spaceValidation.warnings.map((warning, i) => (
                    <Card key={`warning-${i}`} className="p-3 bg-yellow-950/30 border-yellow-800/50">
                      <div className="flex items-start gap-2 text-sm text-yellow-400">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Service Periods */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Service Periods</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Define your operating schedule (e.g., Breakfast, Lunch, Dinner). You can skip this and add later.
                </p>
              </div>

              {/* Added services */}
              {services.length > 0 && (
                <div className="space-y-2">
                  {services.map((service, index) => (
                    <Card key={index} className="p-3 flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-5 gap-2 text-sm">
                        <span className="font-medium text-zinc-50">{service.service_name}</span>
                        <span className="text-zinc-400">{service.days_per_week} days/wk</span>
                        <span className="text-zinc-400">{service.avg_covers_per_service} covers</span>
                        <span className="text-zinc-400">${service.avg_food_check} food</span>
                        <span className="text-zinc-400">${service.avg_bev_check} bev</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveService(index)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add new service */}
              <Card className="p-4 border-dashed">
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    <Input
                      placeholder="Service name"
                      value={newService.service_name}
                      onChange={(e) => setNewService({ ...newService, service_name: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Days/week"
                      step="0.5"
                      value={newService.days_per_week}
                      onChange={(e) => setNewService({ ...newService, days_per_week: parseFloat(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Avg covers"
                      value={newService.avg_covers_per_service || ""}
                      onChange={(e) => setNewService({ ...newService, avg_covers_per_service: parseFloat(e.target.value) || 0 })}
                    />
                    <Input
                      type="number"
                      placeholder="Food check"
                      step="0.01"
                      value={newService.avg_food_check || ""}
                      onChange={(e) => setNewService({ ...newService, avg_food_check: parseFloat(e.target.value) || 0 })}
                    />
                    <Input
                      type="number"
                      placeholder="Bev check"
                      step="0.01"
                      value={newService.avg_bev_check || ""}
                      onChange={(e) => setNewService({ ...newService, avg_bev_check: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <Button onClick={handleAddService} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Service Period
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Step 4: Private Dining */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Private Dining Rooms (Optional)</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Add private event spaces if applicable. You can skip this.
                </p>
              </div>

              {/* Added PDRs */}
              {pdrs.length > 0 && (
                <div className="space-y-2">
                  {pdrs.map((pdr, index) => (
                    <Card key={index} className="p-3 flex items-center justify-between">
                      <div className="flex-1 text-sm">
                        <span className="font-medium text-zinc-50">{pdr.room_name}</span>
                        <span className="text-zinc-400 ml-4">
                          Cap: {pdr.capacity} | {pdr.events_per_month} events/mo | ${pdr.avg_spend_per_person}/person
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemovePDR(index)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add new PDR */}
              <Card className="p-4 border-dashed">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Room name"
                      value={newPDR.room_name}
                      onChange={(e) => setNewPDR({ ...newPDR, room_name: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Capacity"
                      value={newPDR.capacity}
                      onChange={(e) => setNewPDR({ ...newPDR, capacity: parseInt(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Events/month"
                      step="0.1"
                      value={newPDR.events_per_month}
                      onChange={(e) => setNewPDR({ ...newPDR, events_per_month: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Avg spend/person"
                      step="0.01"
                      value={newPDR.avg_spend_per_person}
                      onChange={(e) => setNewPDR({ ...newPDR, avg_spend_per_person: parseFloat(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Avg party size"
                      step="0.1"
                      value={newPDR.avg_party_size}
                      onChange={(e) => setNewPDR({ ...newPDR, avg_party_size: parseFloat(e.target.value) })}
                    />
                  </div>
                  <Button onClick={handleAddPDR} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Private Room
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Step 5: Labor Positions */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-50">Labor Positions & Wages</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Set your market wage parameters. Position rates will be calculated automatically.
                </p>
              </div>

              <Card className="bg-zinc-900/50 border-zinc-800 p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="minWageCity" className="text-sm text-zinc-300">
                        Local Min Wage *
                      </Label>
                      <Input
                        id="minWageCity"
                        type="number"
                        step="0.01"
                        value={laborWages.minWageCity}
                        onChange={(e) => setLaborWages({ ...laborWages, minWageCity: parseFloat(e.target.value) || 0 })}
                        className="mt-1"
                      />
                      <p className="text-xs text-zinc-500 mt-1">Primary wage driver</p>
                    </div>

                    <div>
                      <Label htmlFor="tipCredit" className="text-sm text-zinc-300">
                        Tip Credit (Optional)
                      </Label>
                      <Input
                        id="tipCredit"
                        type="number"
                        step="0.01"
                        value={laborWages.tipCredit}
                        onChange={(e) => setLaborWages({ ...laborWages, tipCredit: parseFloat(e.target.value) || 0 })}
                        className="mt-1"
                      />
                      <p className="text-xs text-zinc-500 mt-1">Default 0 = no tip credit</p>
                    </div>

                    <div>
                      <Label htmlFor="marketTier" className="text-sm text-zinc-300">
                        Market Tier
                      </Label>
                      <Select
                        value={laborWages.marketTier}
                        onValueChange={(value: "LOW" | "MID" | "HIGH") =>
                          setLaborWages({ ...laborWages, marketTier: value })
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">LOW (0.95×)</SelectItem>
                          <SelectItem value="MID">MID (1.00×)</SelectItem>
                          <SelectItem value="HIGH">HIGH (1.10×)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500 mt-1">Market competitiveness</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-700">
                    <h4 className="text-sm font-medium text-zinc-300 mb-3">
                      Select Positions for Your Concept
                    </h4>
                    <p className="text-xs text-zinc-500 mb-3">
                      Check the positions you need. Rates are calculated automatically based on your wage parameters.
                    </p>

                    {loadingPositions ? (
                      <div className="text-center py-8 text-zinc-500 text-sm">Loading positions...</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                        {positionTemplates.map((position) => {
                          const calculatedRate = calculatePositionRate(
                            {
                              minWageCity: laborWages.minWageCity,
                              tipCredit: laborWages.tipCredit,
                              marketTier: laborWages.marketTier,
                            },
                            {
                              wage_multiplier: position.wage_multiplier,
                              is_tipped: position.is_tipped,
                            }
                          );

                          return (
                            <label
                              key={position.position_name}
                              className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                                selectedPositions.includes(position.position_name)
                                  ? "bg-[#D4AF37]/10 border-[#D4AF37]/50"
                                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPositions.includes(position.position_name)}
                                onChange={() => togglePosition(position.position_name)}
                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-[#D4AF37] focus:ring-[#D4AF37]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-300 truncate">
                                  {position.position_name}
                                </div>
                                <div className="text-xs text-zinc-500 mt-0.5">
                                  {position.category} • ${calculatedRate.toFixed(2)}/hr
                                  {position.is_tipped && " (tipped)"}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {positionTemplates.length > 0 && (
                      <div className="mt-3 text-xs text-zinc-500">
                        {selectedPositions.length} of {positionTemplates.length} positions selected
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {step < 5 ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={loading}>
                <Check className="w-4 h-4 mr-2" />
                {loading ? "Creating..." : "Create Scenario"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
