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
  const [benchmarks, setBenchmarks] = useState<any>(null);
  const [showPositions, setShowPositions] = useState(false);
  const [positionMix, setPositionMix] = useState<{ foh: any[]; boh: any[] }>({ foh: [], boh: [] });
  const [useManualOverride, setUseManualOverride] = useState(false);
  const [useDifferentConcept, setUseDifferentConcept] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<string>("");
  const [revenueData, setRevenueData] = useState<any>(null);
  const [loadingRevenue, setLoadingRevenue] = useState(true);

  // Convert kebab-case to title case for display
  const displayConcept = CONCEPT_TYPE_MAP[conceptType] || "Casual Dining";

  // Use selected concept if override is enabled, otherwise use project concept
  const activeConcept = useDifferentConcept && selectedConcept ? selectedConcept : displayConcept;

  const [formData, setFormData] = useState({
    foh_hours_per_100_covers: assumptions?.foh_hours_per_100_covers || 20,
    boh_hours_per_100_covers: assumptions?.boh_hours_per_100_covers || 15,
    foh_hourly_rate: assumptions?.foh_hourly_rate || 22,
    boh_hourly_rate: assumptions?.boh_hourly_rate || 24,
    payroll_burden_pct: assumptions?.payroll_burden_pct ? assumptions.payroll_burden_pct * 100 : 25,
  });

  const [coreManagement, setCoreManagement] = useState<any[]>([
    { role_name: "GM Salary", annual_salary: assumptions?.gm_salary_annual || 90000, category: "FOH" },
    { role_name: "AGM Salary", annual_salary: assumptions?.agm_salary_annual || 65000, category: "FOH" },
    { role_name: "KM Salary", annual_salary: assumptions?.km_salary_annual || 75000, category: "BOH" },
  ]);

  // Load benchmarks when active concept changes
  useEffect(() => {
    if (activeConcept) {
      loadBenchmarks(activeConcept);
      loadPositionMix(activeConcept);
    }
  }, [activeConcept]);

  // Load revenue data
  useEffect(() => {
    loadRevenueData();
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
      const response = await fetch(`/api/proforma/labor-position-mix?scenarioId=${scenarioId}&concept=${encodeURIComponent(concept)}`);
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

  const loadRevenueData = async () => {
    console.log('Loading revenue data for scenario:', scenarioId);
    try {
      // Import supabase client
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Get service periods with avg_check
      const { data: services, error: servicesError } = await supabase
        .from('proforma_revenue_service_periods')
        .select('id, operating_days, avg_check')
        .eq('scenario_id', scenarioId);

      console.log('Services:', services, 'Error:', servicesError);

      if (!services || services.length === 0) {
        console.log('No services found');
        setRevenueData({ annual_revenue: 0, annual_covers: 0 });
        setLoadingRevenue(false);
        return;
      }

      // Note: proforma_center_service_metrics table doesn't exist in current schema
      // Revenue is calculated from service.avg_check or from bar_revenue/pdr_revenue in participation
      const centerMetrics = null;

      // Get covers (for regular dining) - fallback if metrics not available
      const { data: covers, error: coversError } = await supabase
        .from('proforma_service_period_covers')
        .select('*')
        .in('service_period_id', services.map((s: any) => s.id));

      // Get participation data (for bar_guests, pdr_revenue, bar_revenue)
      const { data: participation, error: participationError } = await supabase
        .from('proforma_center_service_participation')
        .select('*')
        .in('service_period_id', services.map((s: any) => s.id));

      // Calculate totals - matching RevenueMatrixView logic (lines 426-449)
      let totalAnnualRevenue = 0;
      let totalAnnualCovers = 0;

      console.log('=== REVENUE CALC DEBUG V3 ===');
      console.log('All services:', services.map((s: any) => ({
        id: s.id,
        name: s.name,
        avg_check: s.avg_check,
        avg_covers_per_service: s.avg_covers_per_service
      })));

      for (const service of services) {
        const daysPerWeek = service.operating_days?.length || 7;
        const servicesPerYear = daysPerWeek * 52;
        const serviceLevelAvgCheck = (service as any).avg_check || 0;
        const avgCoversPerService = (service as any).avg_covers_per_service || 0;

        // Get participation records for this service
        const serviceParticipationRecords = participation?.filter((p: any) => p.service_period_id === service.id) || [];

        // STANDARDIZED COVERS CALCULATION (matching RevenueMatrixView.tsx:246-290)
        // Get regular dining covers from covers table
        const serviceCovers = covers?.filter(
          (c: any) => c.service_period_id === service.id
        ) || [];

        const regularCovers = serviceCovers.reduce((sum: number, c: any) => {
          return sum + (c.covers_per_service || 0);
        }, 0);

        // Determine covers to use: avg_covers_per_service (Mode A) or regularCovers (Mode B)
        const coversToUse = avgCoversPerService > 0 ? avgCoversPerService : regularCovers;

        // Calculate dining revenue: regular covers × service avg_check
        const diningRevenue = coversToUse * serviceLevelAvgCheck;

        // Get bar guests from participation (count as covers for labor, have separate revenue)
        const barGuests = serviceParticipationRecords
          .reduce((sum: number, p: any) => sum + (p.bar_guests || 0), 0);

        // Get PDR covers from participation (count as covers for labor, have separate revenue)
        const pdrCovers = serviceParticipationRecords
          .reduce((sum: number, p: any) => sum + (p.pdr_covers || 0), 0);

        // TOTAL covers for labor calculation = dining + bar + PDR
        const totalCovers = coversToUse + barGuests + pdrCovers;
        totalAnnualCovers += totalCovers * servicesPerYear;

        // Calculate PDR revenue separately (has its own pricing)
        const pdrRevenue = serviceParticipationRecords
          .reduce((sum: number, p: any) => sum + (p.pdr_revenue || 0), 0);

        // Calculate bar revenue separately (has its own pricing)
        const barRevenue = serviceParticipationRecords
          .reduce((sum: number, p: any) => sum + (p.bar_revenue || 0), 0);

        // Calculate base dining revenue (covers × avg_check)
        const baseRevenue = diningRevenue;

        // Total revenue per service
        const weeklyRevenue = (baseRevenue + barRevenue + pdrRevenue) * daysPerWeek;
        const serviceRevenue = weeklyRevenue * 52;
        totalAnnualRevenue += serviceRevenue;

        console.log(`Service ${service.id}:`, {
          regularCovers,
          avgCoversPerService,
          coversToUse,
          barGuests,
          pdrCovers,
          totalCovers,
          serviceLevelAvgCheck,
          diningRevenue,
          barRevenue,
          pdrRevenue,
          daysPerWeek,
          weeklyRevenue,
          serviceRevenue,
        });
      }
      console.log('Total:', { totalAnnualRevenue, totalAnnualCovers });
      console.log('======================');


      setRevenueData({
        annual_revenue: Math.round(totalAnnualRevenue),
        annual_covers: Math.round(totalAnnualCovers),
      });
    } catch (error) {
      console.error("Error loading revenue data:", error);
      setRevenueData({ annual_revenue: 0, annual_covers: 0 });
    } finally {
      setLoadingRevenue(false);
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

  const totalHoursPer100 = formData.foh_hours_per_100_covers + formData.boh_hours_per_100_covers;

  // Calculate labor % of sales
  const calculateLaborMetrics = () => {
    if (!revenueData || !revenueData.annual_revenue || !revenueData.annual_covers) {
      return null;
    }

    const annualRevenue = revenueData.annual_revenue;
    const annualCovers = revenueData.annual_covers;

    // Hourly labor calculation
    const fohHours = (annualCovers / 100) * formData.foh_hours_per_100_covers;
    const bohHours = (annualCovers / 100) * formData.boh_hours_per_100_covers;
    const totalHours = fohHours + bohHours;

    const fohCost = fohHours * formData.foh_hourly_rate;
    const bohCost = bohHours * formData.boh_hourly_rate;
    const hourlyLaborCost = fohCost + bohCost;
    const hourlyLaborPct = (hourlyLaborCost / annualRevenue) * 100;

    // Productivity metrics (for validation)
    const coversPerHour = totalHours > 0 ? annualCovers / totalHours : 0;
    const estimatedFTEs = totalHours / 2080; // 2080 hours = full-time year

    // Salaried labor cost
    const totalSalariedCost = coreManagement.reduce((sum, role) => sum + (role.annual_salary || 0), 0);
    const salariedLaborPct = (totalSalariedCost / annualRevenue) * 100;

    // Total labor with burden
    const grossLabor = hourlyLaborCost + totalSalariedCost;
    const burdenCost = grossLabor * (formData.payroll_burden_pct / 100);
    const totalLaborCost = grossLabor + burdenCost;
    const totalLaborPct = (totalLaborCost / annualRevenue) * 100;

    // Validation flags
    const isUnrealisticLabor = totalLaborPct > 50;
    const isLowProductivity = coversPerHour < 1;
    const isHighProductivity = coversPerHour > 10;

    return {
      annualRevenue,
      annualCovers,
      fohHours,
      bohHours,
      totalHours,
      coversPerHour,
      estimatedFTEs,
      hourlyLaborCost,
      hourlyLaborPct,
      totalSalariedCost,
      salariedLaborPct,
      burdenCost,
      totalLaborCost,
      totalLaborPct,
      isUnrealisticLabor,
      isLowProductivity,
      isHighProductivity,
    };
  };

  const laborMetrics = calculateLaborMetrics();

  // RECONCILIATION: Layer 1 (blended) vs Layer 2 (position detail)
  const calculateReconciliation = () => {
    if (!positionMix || positionMix.foh.length === 0) return null;

    // Layer 1: User-entered blended totals
    const layer1FOH = formData.foh_hours_per_100_covers;
    const layer1BOH = formData.boh_hours_per_100_covers;
    const layer1Total = layer1FOH + layer1BOH;

    // Layer 2: Sum of VOLUME positions from templates
    const layer2FOH = positionMix.foh
      .filter((p: any) => p.labor_driver_type === 'VOLUME')
      .reduce((sum: number, p: any) => sum + (p.hours_per_100_covers || 0), 0);
    const layer2BOH = positionMix.boh
      .filter((p: any) => p.labor_driver_type === 'VOLUME')
      .reduce((sum: number, p: any) => sum + (p.hours_per_100_covers || 0), 0);
    const layer2Total = layer2FOH + layer2BOH;

    // Calculate variance
    const varianceFOH = layer1FOH > 0 ? Math.abs(layer1FOH - layer2FOH) / layer1FOH : 0;
    const varianceBOH = layer1BOH > 0 ? Math.abs(layer1BOH - layer2BOH) / layer1BOH : 0;
    const varianceTotal = layer1Total > 0 ? Math.abs(layer1Total - layer2Total) / layer1Total : 0;

    // Tolerance: 10% variance allowed
    const hasSignificantVariance = varianceTotal > 0.10;

    return {
      layer1: { foh: layer1FOH, boh: layer1BOH, total: layer1Total },
      layer2: { foh: layer2FOH, boh: layer2BOH, total: layer2Total },
      variance: { foh: varianceFOH, boh: varianceBOH, total: varianceTotal },
      hasSignificantVariance,
    };
  };

  const reconciliation = calculateReconciliation();

  const syncToPositionTemplates = () => {
    if (!reconciliation) return;

    setFormData(prev => ({
      ...prev,
      foh_hours_per_100_covers: reconciliation.layer2.foh,
      boh_hours_per_100_covers: reconciliation.layer2.boh,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-2">
          Labor Assumptions
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          Productivity-based labor model (not % of sales). Covers drive everything.
        </p>

        {/* Labor % of Sales - Live Calculation */}
        {laborMetrics && (
          <div className="bg-gradient-to-br from-[#D4AF37]/5 to-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-semibold text-zinc-700 mb-3">Labor % of Sales (Live Calculation)</h4>
            <div className="grid grid-cols-4 gap-4 mb-3">
              <div className="text-center">
                <div className="text-xs text-zinc-600 mb-1">Annual Revenue</div>
                <div className="text-base font-bold text-zinc-900">
                  ${(laborMetrics.annualRevenue / 1000000).toFixed(2)}M
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  ${laborMetrics.annualRevenue.toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-zinc-600 mb-1">Annual Covers</div>
                <div className="text-base font-bold text-zinc-900">
                  {laborMetrics.annualCovers.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {(laborMetrics.annualRevenue / laborMetrics.annualCovers).toFixed(2)} avg check
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-zinc-600 mb-1">Hourly Labor %</div>
                <div className="text-base font-bold text-blue-600">
                  {laborMetrics.hourlyLaborPct.toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  ${laborMetrics.hourlyLaborCost.toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-zinc-600 mb-1">Salaried Labor %</div>
                <div className="text-base font-bold text-emerald-600">
                  {laborMetrics.salariedLaborPct.toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  ${laborMetrics.totalSalariedCost.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="border-t border-[#D4AF37]/30 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-700">Total Labor % (w/ Burden)</div>
                  <div className="text-xs text-zinc-600 mt-0.5">
                    Burden: ${laborMetrics.burdenCost.toLocaleString()} ({formData.payroll_burden_pct}%) •
                    Total: ${laborMetrics.totalLaborCost.toLocaleString()}
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#D4AF37]">
                  {laborMetrics.totalLaborPct.toFixed(1)}%
                </div>
              </div>
              {benchmarks && (
                <div className="mt-2 text-xs">
                  <span className="text-zinc-600">Target range for {activeConcept}: </span>
                  <span className="text-zinc-900 font-medium">{benchmarks.labor_pct_min}–{benchmarks.labor_pct_max}%</span>
                  {laborMetrics.totalLaborPct < benchmarks.labor_pct_min && (
                    <span className="text-amber-600 ml-2 font-medium">⚠️ Below target</span>
                  )}
                  {laborMetrics.totalLaborPct > benchmarks.labor_pct_max && (
                    <span className="text-rose-600 ml-2 font-medium">⚠️ Above target</span>
                  )}
                  {laborMetrics.totalLaborPct >= benchmarks.labor_pct_min && laborMetrics.totalLaborPct <= benchmarks.labor_pct_max && (
                    <span className="text-emerald-600 ml-2 font-medium">✓ Within target</span>
                  )}
                </div>
              )}

              {/* Productivity Metrics */}
              <div className="mt-3 pt-3 border-t border-[#D4AF37]/30">
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="text-center">
                    <div className="text-zinc-600 mb-1">Annual Hours</div>
                    <div className="font-semibold text-zinc-900">
                      {laborMetrics.totalHours.toLocaleString()}
                    </div>
                    <div className="text-zinc-500 mt-0.5">
                      ~{laborMetrics.estimatedFTEs.toFixed(1)} FTEs
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-zinc-600 mb-1">Covers/Hour</div>
                    <div className={`font-semibold ${
                      laborMetrics.isLowProductivity ? 'text-rose-600' :
                      laborMetrics.isHighProductivity ? 'text-amber-600' :
                      'text-emerald-600'
                    }`}>
                      {laborMetrics.coversPerHour.toFixed(1)}
                    </div>
                    <div className="text-zinc-500 mt-0.5">
                      {laborMetrics.isLowProductivity && '⚠️ Low productivity'}
                      {laborMetrics.isHighProductivity && '⚠️ High productivity'}
                      {!laborMetrics.isLowProductivity && !laborMetrics.isHighProductivity && '✓ Normal'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-zinc-600 mb-1">Labor/Cover</div>
                    <div className="font-semibold text-zinc-900">
                      ${(laborMetrics.totalLaborCost / laborMetrics.annualCovers).toFixed(2)}
                    </div>
                    <div className="text-zinc-500 mt-0.5">
                      {((laborMetrics.totalHours / laborMetrics.annualCovers) * 60).toFixed(0)} min
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Warnings */}
              {laborMetrics.isUnrealisticLabor && (
                <div className="mt-3 bg-rose-100 border border-rose-300 rounded p-3">
                  <div className="text-xs font-semibold text-rose-800 mb-1">⚠️ Unrealistic Labor Cost</div>
                  <div className="text-xs text-rose-700">
                    Labor % exceeds 50% of sales. Check your hours per 100 covers settings.
                  </div>
                </div>
              )}

              {/* Layer 1 ↔ Layer 2 Reconciliation Warning */}
              {reconciliation && reconciliation.hasSignificantVariance && (
                <div className="mt-3 bg-amber-100 border border-amber-400 rounded p-3">
                  <div className="text-xs font-semibold text-amber-900 mb-2">
                    ⚠️ Layer 1 vs Layer 2 Variance Detected
                  </div>
                  <div className="text-xs text-amber-800 mb-3">
                    Your blended hours (Layer 1) differ from position templates (Layer 2) by more than 10%.
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
                    <div className="bg-white/60 rounded p-2">
                      <div className="text-amber-700 font-medium mb-1">Layer 1 (Blended)</div>
                      <div className="text-amber-900 font-semibold">
                        FOH: {reconciliation.layer1.foh.toFixed(1)}<br/>
                        BOH: {reconciliation.layer1.boh.toFixed(1)}<br/>
                        Total: {reconciliation.layer1.total.toFixed(1)}
                      </div>
                    </div>
                    <div className="bg-white/60 rounded p-2">
                      <div className="text-amber-700 font-medium mb-1">Layer 2 (Templates)</div>
                      <div className="text-amber-900 font-semibold">
                        FOH: {reconciliation.layer2.foh.toFixed(1)}<br/>
                        BOH: {reconciliation.layer2.boh.toFixed(1)}<br/>
                        Total: {reconciliation.layer2.total.toFixed(1)}
                      </div>
                    </div>
                    <div className="bg-white/60 rounded p-2">
                      <div className="text-amber-700 font-medium mb-1">Variance</div>
                      <div className="text-amber-900 font-semibold">
                        FOH: {(reconciliation.variance.foh * 100).toFixed(1)}%<br/>
                        BOH: {(reconciliation.variance.boh * 100).toFixed(1)}%<br/>
                        Total: {(reconciliation.variance.total * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={syncToPositionTemplates}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium py-2 px-3 rounded transition-colors"
                  >
                    Sync Layer 1 to Match Position Templates
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!laborMetrics && !loadingRevenue && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-6 text-center text-zinc-500 text-sm">
            Labor % calculation unavailable. Please complete the Revenue assumptions first.
          </div>
        )}

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
              <h5 className="text-xs font-semibold text-zinc-700 mb-3">FOH Labor</h5>

              {/* Class 1: Volume-Elastic */}
              <div className="mb-4">
                <div className="text-xs text-blue-600 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Class 1: Volume-Elastic
                </div>
                <div className="space-y-1">
                  {positionMix.foh.filter((p: any) => p.labor_driver_type === 'VOLUME').map((pos: any) => (
                    <div
                      key={pos.position_name}
                      className="flex items-center justify-between text-xs bg-zinc-100 border border-zinc-300 rounded px-2 py-1.5"
                    >
                      <span className="text-zinc-900 font-medium">{pos.position_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-700">${pos.hourly_rate}/hr</span>
                        <span className="font-semibold text-amber-600 w-12 text-right">
                          {pos.position_mix_pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-zinc-400 mt-1.5 pt-1.5 flex justify-between text-xs font-semibold">
                    <span className="text-zinc-700">Volume Total</span>
                    <span className="text-amber-600">100%</span>
                  </div>
                </div>
              </div>

              {/* Class 2: Presence-Required */}
              {positionMix.foh.some((p: any) => p.labor_driver_type === 'PRESENCE') && (
                <div className="mb-4">
                  <div className="text-xs text-emerald-600 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Class 2: Presence-Required
                  </div>
                  <div className="space-y-1">
                    {positionMix.foh.filter((p: any) => p.labor_driver_type === 'PRESENCE').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-300 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-900 font-medium">{pos.position_name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-700">{pos.staff_per_service}×{pos.hours_per_shift}hr @ ${pos.hourly_rate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Class 3: Threshold */}
              {positionMix.foh.some((p: any) => p.labor_driver_type === 'THRESHOLD') && (
                <div>
                  <div className="text-xs text-amber-600 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    Class 3: Threshold
                  </div>
                  <div className="space-y-1">
                    {positionMix.foh.filter((p: any) => p.labor_driver_type === 'THRESHOLD').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-amber-50 border border-amber-300 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-900 font-medium">{pos.position_name}</span>
                        <div className="text-xs text-zinc-700">
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
              <h5 className="text-xs font-semibold text-zinc-700 mb-3">BOH Labor</h5>

              {/* Class 1: Volume-Elastic */}
              <div className="mb-4">
                <div className="text-xs text-blue-600 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Class 1: Volume-Elastic
                </div>
                <div className="space-y-1">
                  {positionMix.boh.filter((p: any) => p.labor_driver_type === 'VOLUME').map((pos: any) => (
                    <div
                      key={pos.position_name}
                      className="flex items-center justify-between text-xs bg-zinc-100 border border-zinc-300 rounded px-2 py-1.5"
                    >
                      <span className="text-zinc-900 font-medium">{pos.position_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-700">${pos.hourly_rate}/hr</span>
                        <span className="font-semibold text-amber-600 w-12 text-right">
                          {pos.position_mix_pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-zinc-400 mt-1.5 pt-1.5 flex justify-between text-xs font-semibold">
                    <span className="text-zinc-700">Volume Total</span>
                    <span className="text-amber-600">100%</span>
                  </div>
                </div>
              </div>

              {/* Class 2: Presence-Required */}
              {positionMix.boh.some((p: any) => p.labor_driver_type === 'PRESENCE') && (
                <div className="mb-4">
                  <div className="text-xs text-emerald-600 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Class 2: Presence-Required
                  </div>
                  <div className="space-y-1">
                    {positionMix.boh.filter((p: any) => p.labor_driver_type === 'PRESENCE').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-300 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-900 font-medium">{pos.position_name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-700">{pos.staff_per_service}×{pos.hours_per_shift}hr @ ${pos.hourly_rate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Class 3: Threshold */}
              {positionMix.boh.some((p: any) => p.labor_driver_type === 'THRESHOLD') && (
                <div>
                  <div className="text-xs text-amber-600 font-medium mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    Class 3: Threshold
                  </div>
                  <div className="space-y-1">
                    {positionMix.boh.filter((p: any) => p.labor_driver_type === 'THRESHOLD').map((pos: any) => (
                      <div
                        key={pos.position_name}
                        className="flex items-center justify-between text-xs bg-amber-50 border border-amber-300 rounded px-2 py-1.5"
                      >
                        <span className="text-zinc-900 font-medium">{pos.position_name}</span>
                        <div className="text-xs text-zinc-700">
                          After {pos.cover_threshold} cvrs
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-zinc-100 border border-zinc-300 rounded text-xs space-y-2">
            <p className="text-zinc-900">
              <Info className="inline w-3 h-3 mr-1" />
              <strong>Three-tier labor classification:</strong>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-zinc-800">
                <div className="text-blue-600 font-medium mb-1">Volume-Elastic</div>
                <div className="text-zinc-700">Scales with covers. Example: 90 FOH hrs × 45% = 40.5 server hrs</div>
              </div>
              <div className="text-zinc-800">
                <div className="text-emerald-600 font-medium mb-1">Presence-Required</div>
                <div className="text-zinc-700">Fixed per active service. Example: 2 security × 6 hrs when service is on</div>
              </div>
              <div className="text-zinc-800">
                <div className="text-amber-600 font-medium mb-1">Threshold</div>
                <div className="text-zinc-700">Kicks in after volume threshold. Example: +1 maître d' after 250 covers</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showPositions && (
        <div className="flex justify-center gap-3">
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
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => window.alert("Position management:\n\n• VOLUME positions: Managed in wizard only\n• PRESENCE/THRESHOLD positions: Add them here (UI coming soon)\n\nFor now, you can add PRESENCE/THRESHOLD positions directly via the database or API.")}
            className="text-xs bg-[#D4AF37] hover:bg-[#C19B2C] text-zinc-900"
          >
            Manage PRESENCE/THRESHOLD Positions
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
              <div className="col-span-4">
                <Input
                  value={mgmt.role_name}
                  onChange={(e) => {
                    const updated = [...coreManagement];
                    updated[index].role_name = e.target.value;
                    setCoreManagement(updated);
                  }}
                  placeholder="Role Name"
                  className="text-sm"
                />
              </div>
              <div className="col-span-2">
                <select
                  value={mgmt.category || "FOH"}
                  onChange={(e) => {
                    const updated = [...coreManagement];
                    updated[index].category = e.target.value;
                    setCoreManagement(updated);
                  }}
                  className="w-full h-9 px-3 rounded-md border border-zinc-300 text-sm bg-white"
                >
                  <option value="FOH">FOH</option>
                  <option value="BOH">BOH</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="col-span-4">
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
                  className="text-sm"
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
                { role_name: "", annual_salary: 0, category: "FOH" },
              ]);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Management Position
          </Button>

          {/* Totals by Category */}
          {coreManagement.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-700 space-y-2">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-zinc-100 p-3 rounded border border-zinc-200">
                  <div className="text-xs text-zinc-600 mb-1">FOH Total</div>
                  <div className="text-lg font-semibold text-blue-600">
                    ${coreManagement
                      .filter(m => m.category === "FOH")
                      .reduce((sum, m) => sum + (m.annual_salary || 0), 0)
                      .toLocaleString()}
                  </div>
                </div>
                <div className="bg-zinc-100 p-3 rounded border border-zinc-200">
                  <div className="text-xs text-zinc-600 mb-1">BOH Total</div>
                  <div className="text-lg font-semibold text-emerald-600">
                    ${coreManagement
                      .filter(m => m.category === "BOH")
                      .reduce((sum, m) => sum + (m.annual_salary || 0), 0)
                      .toLocaleString()}
                  </div>
                </div>
                <div className="bg-zinc-100 p-3 rounded border border-zinc-200">
                  <div className="text-xs text-zinc-600 mb-1">Other Total</div>
                  <div className="text-lg font-semibold text-amber-600">
                    ${coreManagement
                      .filter(m => m.category === "Other")
                      .reduce((sum, m) => sum + (m.annual_salary || 0), 0)
                      .toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="bg-[#D4AF37]/10 p-3 rounded border border-[#D4AF37]/30">
                <div className="text-xs text-zinc-600 mb-1">Total Management Salaries</div>
                <div className="text-xl font-bold text-[#D4AF37]">
                  ${coreManagement
                    .reduce((sum, m) => sum + (m.annual_salary || 0), 0)
                    .toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* PRESENCE Roles (Fixed Per Service) */}
      {positionMix && (positionMix.foh.some((p: any) => p.labor_driver_type === 'PRESENCE') || positionMix.boh.some((p: any) => p.labor_driver_type === 'PRESENCE')) && (
        <div className="border-t border-zinc-800 pt-4">
          <h4 className="text-sm font-medium text-zinc-300 mb-2">
            Fixed Presence Roles
          </h4>
          <p className="text-xs text-zinc-500 mb-3">
            These positions are required per service period regardless of volume (e.g., Security, Maître d')
          </p>

          <div className="space-y-3">
            {/* FOH Presence Roles */}
            {positionMix.foh.filter((p: any) => p.labor_driver_type === 'PRESENCE').map((pos: any) => (
              <div key={pos.position_name} className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-emerald-400">{pos.position_name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">FOH • Fixed per service</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-500">Hourly Rate</div>
                    <div className="text-sm font-semibold text-zinc-300">${pos.hourly_rate}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-900/50 rounded p-2">
                    <div className="text-zinc-500 mb-1">Staff per Service</div>
                    <div className="text-zinc-300 font-medium">{pos.staff_per_service}</div>
                  </div>
                  <div className="bg-zinc-900/50 rounded p-2">
                    <div className="text-zinc-500 mb-1">Hours per Shift</div>
                    <div className="text-zinc-300 font-medium">{pos.hours_per_shift}</div>
                  </div>
                </div>
              </div>
            ))}

            {/* BOH Presence Roles */}
            {positionMix.boh.filter((p: any) => p.labor_driver_type === 'PRESENCE').map((pos: any) => (
              <div key={pos.position_name} className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-emerald-400">{pos.position_name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">BOH • Fixed per service</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-500">Hourly Rate</div>
                    <div className="text-sm font-semibold text-zinc-300">${pos.hourly_rate}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-900/50 rounded p-2">
                    <div className="text-zinc-500 mb-1">Staff per Service</div>
                    <div className="text-zinc-300 font-medium">{pos.staff_per_service}</div>
                  </div>
                  <div className="bg-zinc-900/50 rounded p-2">
                    <div className="text-zinc-500 mb-1">Hours per Shift</div>
                    <div className="text-zinc-300 font-medium">{pos.hours_per_shift}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded p-2">
            💡 These are template defaults from your concept type. You can customize or add more positions below.
          </div>
        </div>
      )}

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
