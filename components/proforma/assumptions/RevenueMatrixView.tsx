"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CenterServiceMetricsEditor } from "./CenterServiceMetricsEditor";

interface RevenueCenter {
  id: string;
  center_name: string;
  seats: number;
  sort_order: number;
  is_bar?: boolean;
  bar_mode?: 'seated' | 'standing' | 'none';
  is_pdr?: boolean;
  max_seats?: number;
}

interface ServicePeriodCover {
  id: string;
  service_period_id: string;
  revenue_center_id: string;
  covers_per_service: number;
  is_manually_edited: boolean;
  revenue_center?: RevenueCenter;
}

interface ServicePeriod {
  id: string;
  service_name: string;
  days_per_week: number;
  avg_check: number;
  avg_covers_per_service: number | null;
  food_pct: number;
  bev_pct: number;
  other_pct: number;
  sort_order: number;
  operating_days?: number[];
  day_of_week_distribution?: number[];
  service_hours?: number;
  avg_dining_time_hours?: number;
  default_utilization_pct?: number;
}

interface RevenueMatrixViewProps {
  scenarioId: string;
}

export function RevenueMatrixView({ scenarioId }: RevenueMatrixViewProps) {
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [centers, setCenters] = useState<RevenueCenter[]>([]);
  const [covers, setCovers] = useState<ServicePeriodCover[]>([]);
  const [participation, setParticipation] = useState<any[]>([]); // For bar_guests and pdr_covers
  const [loading, setLoading] = useState(true);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [editingCover, setEditingCover] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [localServiceValues, setLocalServiceValues] = useState<Record<string, Partial<ServicePeriod>>>({});
  const [localCoverValue, setLocalCoverValue] = useState<number>(0);
  const [metricsEditorOpen, setMetricsEditorOpen] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<{ centerId: string; serviceId: string } | null>(null);
  const [localUtilValues, setLocalUtilValues] = useState<Record<string, number>>({});
  const [localServiceUtilValues, setLocalServiceUtilValues] = useState<Record<string, number>>({});
  const [individualUtilMode, setIndividualUtilMode] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadData();
  }, [scenarioId]);

  useEffect(() => {
    // Auto-expand all services on mount
    if (services.length > 0) {
      setExpandedServices(new Set(services.map(s => s.id)));
    }
  }, [services]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [servicesRes, centersRes, coversRes, participationRes] = await Promise.all([
        fetch(`/api/proforma/service-periods?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/revenue-centers?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/service-period-covers?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/center-participation?scenario_id=${scenarioId}`)
      ]);

      const [servicesData, centersData, coversData, participationData] = await Promise.all([
        servicesRes.json(),
        centersRes.ok ? centersRes.json() : { centers: [] },
        coversRes.ok ? coversRes.json() : { covers: [] },
        participationRes.ok ? participationRes.json() : { participation: [] }
      ]);

      setServices((servicesData.servicePeriods || []).sort((a: ServicePeriod, b: ServicePeriod) => a.sort_order - b.sort_order));
      setCenters((centersData.centers || []).sort((a: RevenueCenter, b: RevenueCenter) => a.sort_order - b.sort_order));
      setCovers(coversData.covers || []);
      setParticipation(participationData.participation || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openMetricsEditor = (centerId: string, serviceId: string) => {
    setSelectedMetrics({ centerId, serviceId });
    setMetricsEditorOpen(true);
  };

  const closeMetricsEditor = () => {
    setMetricsEditorOpen(false);
    setSelectedMetrics(null);
    loadData(); // Reload data after closing editor
  };

  const handleServiceUpdate = async (serviceId: string, updates: Partial<ServicePeriod>) => {
    // Optimistic update
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, ...updates } : s));

    try {
      const response = await fetch("/api/proforma/service-periods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: serviceId,
          ...updates,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Service update failed:", errorData);
        throw new Error(errorData.error || "Failed to update service");
      }

      // Auto-recalculate covers if settings that affect calculation changed
      const recalcTriggers = ['service_hours', 'avg_dining_time_hours', 'default_utilization_pct'];
      const shouldRecalc = Object.keys(updates).some(key => recalcTriggers.includes(key));

      if (shouldRecalc) {
        const service = services.find(s => s.id === serviceId);
        if (service) {
          // Only recalculate if in State B (covers already allocated)
          const serviceCovers = covers.filter(c => c.service_period_id === serviceId);
          if (serviceCovers.length > 0) {
            await handleAutoCalculateCovers({ ...service, ...updates });
          }
        }
      }
    } catch (error) {
      console.error("Error updating service:", error);
      alert("Failed to update service");
      // Revert on error
      await loadData();
    }
  };

  const handleAllocateToCenter = async (serviceId: string, totalCovers: number) => {
    try {
      const response = await fetch("/api/proforma/allocate-covers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_period_id: serviceId,
          total_covers: totalCovers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to allocate covers");
        return;
      }

      // Optimistic update - set the allocations from the response
      if (data.allocations) {
        setCovers(prev => {
          // Remove old covers for this service
          const filtered = prev.filter(c => c.service_period_id !== serviceId);
          // Add new allocations
          return [...filtered, ...data.allocations.map((a: any) => ({
            id: a.id || crypto.randomUUID(),
            service_period_id: a.service_period_id,
            revenue_center_id: a.revenue_center_id,
            covers_per_service: a.covers_per_service,
            is_manually_edited: a.is_manually_edited || false,
          }))];
        });
      }

      // Auto-expand to show the allocation
      setExpandedServices(prev => new Set([...prev, serviceId]));
    } catch (error) {
      console.error("Error allocating covers:", error);
      alert("Failed to allocate covers");
    }
  };

  const handleCoverUpdate = async (coverId: string, newValue: number) => {
    // Optimistic update
    setCovers(prev => prev.map(c =>
      c.id === coverId
        ? { ...c, covers_per_service: newValue, is_manually_edited: true }
        : c
    ));
    setEditingCover(null);

    try {
      const response = await fetch("/api/proforma/service-period-covers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: coverId,
          covers_per_service: newValue,
          is_manually_edited: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update cover");
      }
    } catch (error) {
      console.error("Error updating cover:", error);
      alert("Failed to update cover");
      // Revert on error
      await loadData();
    }
  };

  const getServiceState = (service: ServicePeriod): 'A' | 'B' => {
    const serviceCovers = covers.filter(c => c.service_period_id === service.id);

    if (serviceCovers.length === 0) {
      return 'A'; // Service-only estimate
    }

    return 'B'; // Center-level allocations (never locked)
  };

  const getDerivedTotal = (serviceId: string): number => {
    // Regular dining covers (seat-turnover based)
    const regularCovers = covers
      .filter(c => c.service_period_id === serviceId)
      .reduce((sum, c) => sum + c.covers_per_service, 0);

    // Bar guests from standing bars (throughput-based, count as covers)
    const barGuests = participation
      .filter(p => p.service_period_id === serviceId && p.bar_guests)
      .reduce((sum, p) => sum + (p.bar_guests || 0), 0);

    // PDR covers (event-based, count as covers)
    const pdrCovers = participation
      .filter(p => p.service_period_id === serviceId && p.pdr_covers)
      .reduce((sum, p) => sum + (p.pdr_covers || 0), 0);

    // Debug logging with detailed center breakdown
    const service = services.find(s => s.id === serviceId);
    const coversForService = covers.filter(c => c.service_period_id === serviceId);
    const centerDetails = coversForService.map(c => {
      const center = centers.find(ctr => ctr.id === c.revenue_center_id);
      return {
        center_name: center?.center_name || 'Unknown',
        covers_per_service: c.covers_per_service,
        seats: center?.seats || 0,
        is_manually_edited: c.is_manually_edited
      };
    });

    console.log(`[${service?.service_name}] Covers breakdown:`, {
      regularCovers,
      barGuests,
      pdrCovers,
      total: regularCovers + barGuests + pdrCovers,
      centerDetails,
      participationData: participation.filter(p => p.service_period_id === serviceId)
    });

    // Total Covers = Dining covers + Bar guests + PDR covers
    return regularCovers + barGuests + pdrCovers;
  };

  const getUtilization = (centerCovers: number, centerSeats: number): number => {
    return centerSeats > 0 ? (centerCovers / centerSeats) * 100 : 0;
  };

  const calculateTurns = (serviceHours: number, avgDiningTime: number): number => {
    if (avgDiningTime === 0) return 0;
    return serviceHours / avgDiningTime;
  };

  const calculateCoversForCenter = (
    seats: number,
    serviceHours: number,
    avgDiningTime: number,
    utilizationPct: number
  ): number => {
    const turns = calculateTurns(serviceHours, avgDiningTime);
    return seats * turns * (utilizationPct / 100);
  };

  const handleAutoCalculateCovers = async (service: ServicePeriod, updatedParticipation?: any[]) => {
    const serviceHours = service.service_hours || 3.0;
    const avgDiningTime = service.avg_dining_time_hours || 1.5;

    // Get active centers for this service from participation data
    const participationSource = updatedParticipation || participation;
    const activeParticipation = participationSource.filter(
      p => p.service_period_id === service.id && p.is_active
    );

    if (activeParticipation.length === 0) {
      alert('No revenue centers are active for this service period. Configure participation in Settings tab.');
      return;
    }

    // Calculate covers for each active center using its own utilization %
    const newAllocations = activeParticipation.map(p => {
      const center = centers.find(c => c.id === p.revenue_center_id);
      if (!center) return null;

      const centerUtil = p.default_utilization_pct ?? 65.0; // Per-center utilization
      const covers = calculateCoversForCenter(
        center.seats,
        serviceHours,
        avgDiningTime,
        centerUtil
      );

      return {
        service_period_id: service.id,
        revenue_center_id: center.id,
        covers_per_service: Math.round(covers * 10) / 10, // Round to 1 decimal
        is_manually_edited: false,
      };
    }).filter(Boolean) as any[];

    // Directly update the covers via PATCH endpoint
    try {
      const updatePromises = newAllocations.map(allocation =>
        fetch("/api/proforma/service-period-covers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_period_id: allocation.service_period_id,
            revenue_center_id: allocation.revenue_center_id,
            covers_per_service: allocation.covers_per_service,
            is_manually_edited: false,
          }),
        }).then(res => res.json())
      );

      const results = await Promise.all(updatePromises);

      // Extract the actual cover records from API responses
      const updatedCovers = results.map(r => r.cover).filter(Boolean);

      // Update state with actual database records
      setCovers(prev => {
        const filtered = prev.filter(c => c.service_period_id !== service.id);
        return [...filtered, ...updatedCovers];
      });

      setExpandedServices(prev => new Set([...prev, service.id]));
    } catch (error) {
      console.error("Error calculating covers:", error);
      alert("Failed to calculate covers");
      await loadData(); // Reload on error
    }
  };

  const applyDistributionPreset = async (serviceId: string, preset: string, operatingDays: number[]) => {
    const presets: Record<string, number[]> = {
      'even': [14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2],
      'weekday-biased': [10, 16, 16, 16, 16, 14, 12],
      'weekend-biased': [20, 10, 10, 11, 12, 14, 23],
      'fri-sat-lift': [12, 10, 11, 12, 14, 19, 22],
      'thu-sat-core': [8, 7, 8, 10, 15, 24, 28],
    };

    let baseDist = presets[preset] || presets['even'];
    let newDist = [0, 0, 0, 0, 0, 0, 0];

    if (operatingDays.length === 7) {
      newDist = [...baseDist];
    } else {
      const totalForOperating = operatingDays.reduce((sum, day) => sum + baseDist[day], 0);
      operatingDays.forEach(day => {
        newDist[day] = (baseDist[day] / totalForOperating) * 100;
      });
    }

    // Optimistic update
    setServices(prev => prev.map(s =>
      s.id === serviceId ? { ...s, day_of_week_distribution: newDist } : s
    ));

    try {
      const response = await fetch("/api/proforma/service-periods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: serviceId,
          day_of_week_distribution: newDist,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to apply preset");
      }
    } catch (error) {
      console.error("Error applying preset:", error);
      // Revert on error
      await loadData();
    }
  };

  if (loading) {
    return <div className="text-zinc-400">Loading revenue matrix...</div>;
  }

  // Calculate total revenue across all services
  const totalWeeklyRev = services.reduce((sum, service) => {
    const state = getServiceState(service);
    const derivedTotal = getDerivedTotal(service.id);

    // Calculate PDR revenue separately (has its own pricing)
    const pdrRevenue = participation
      .filter(p => p.service_period_id === service.id && p.pdr_revenue)
      .reduce((pdrSum, p) => pdrSum + (p.pdr_revenue || 0), 0);

    // Calculate standing bar revenue separately (has its own pricing and F&B split)
    const barRevenue = participation
      .filter(p => p.service_period_id === service.id && p.bar_revenue)
      .reduce((barSum, p) => barSum + (p.bar_revenue || 0), 0);

    // Base revenue from covers × avg_check
    const baseRevenue = (state === 'A' ? (service.avg_covers_per_service || 0) : derivedTotal) *
                        (service.avg_check || 0);

    const weeklyRev = (baseRevenue + barRevenue + pdrRevenue) * (service.operating_days?.length || 7);
    return sum + weeklyRev;
  }, 0);
  const totalMonthlyRev = totalWeeklyRev * 52 / 12;
  const totalAnnualRev = totalWeeklyRev * 52;

  // Calculate total covers
  const totalWeeklyCovers = services.reduce((sum, service) => {
    const state = getServiceState(service);
    const derivedTotal = getDerivedTotal(service.id);
    const weeklyCovers = (state === 'A' ? (service.avg_covers_per_service || 0) : derivedTotal) *
                        (service.operating_days?.length || 7);
    return sum + weeklyCovers;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-black mb-2">Revenue Matrix</h3>
        <p className="text-sm text-zinc-600">
          Configure covers, check averages, and F&B mix for each service period
        </p>
      </div>

      {/* Financial Summary Dashboard */}
      <Card className="p-6 bg-gradient-to-br from-[#D4AF37]/5 to-[#D4AF37]/10 border-[#D4AF37]/30">
        <h4 className="text-sm font-semibold text-zinc-700 mb-4 uppercase tracking-wide">Revenue Summary</h4>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-zinc-600 mb-1">Annual Revenue</div>
            <div className="text-3xl font-bold text-[#D4AF37]">
              ${(totalAnnualRev / 1000000).toFixed(2)}M
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              ${totalAnnualRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-600 mb-1">Monthly Revenue</div>
            <div className="text-2xl font-semibold text-black">
              ${(totalMonthlyRev / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              ${totalMonthlyRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-600 mb-1">Weekly Revenue</div>
            <div className="text-2xl font-semibold text-black">
              ${(totalWeeklyRev / 1000).toFixed(1)}K
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              ${totalWeeklyRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-600 mb-1">Weekly Covers</div>
            <div className="text-2xl font-semibold text-black">
              {totalWeeklyCovers.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Avg Check: ${totalWeeklyCovers > 0 ? (totalWeeklyRev / totalWeeklyCovers).toFixed(2) : '0.00'}
            </div>
          </div>
        </div>
      </Card>

      {/* Service Period Cards with State Management */}
      <div className="space-y-4">
        <h4 className="text-md font-semibold text-black">Service Period Details</h4>

        {services.map((service) => {
          const state = getServiceState(service);
          const isExpanded = expandedServices.has(service.id);
          const serviceCovers = covers.filter(c => c.service_period_id === service.id);
          const derivedTotal = getDerivedTotal(service.id);

          // Calculate PDR revenue separately (it has its own pricing, not avg_check)
          const pdrRevenue = participation
            .filter(p => p.service_period_id === service.id && p.pdr_revenue)
            .reduce((sum, p) => sum + (p.pdr_revenue || 0), 0);

          // Calculate standing bar revenue separately (has its own avg_spend_per_guest and F&B split)
          const barRevenue = participation
            .filter(p => p.service_period_id === service.id && p.bar_revenue)
            .reduce((sum, p) => sum + (p.bar_revenue || 0), 0);

          // Base revenue from covers × avg_check (excludes standing bars and PDRs)
          const baseRevenue = (state === 'A' ? (service.avg_covers_per_service || 0) : derivedTotal) *
                              (service.avg_check || 0);

          // Weekly revenue = (base + bar + PDR) × operating days
          const weeklyRev = (baseRevenue + barRevenue + pdrRevenue) * (service.operating_days?.length || 7);
          const monthlyRev = weeklyRev * 52 / 12;
          const annualRev = weeklyRev * 52;

          return (
            <Card key={service.id} className="p-4 bg-white border-zinc-200">
              <div className="space-y-4">
                <h5 className="font-semibold text-black">{service.service_name}</h5>

                {/* STATE A: Service-Only Estimate with Turns Calculation */}
                {state === 'A' && (
                  <>
                    {/* Turns Calculation Inputs */}
                    {/* Revenue Mix Inputs */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs text-zinc-600">Avg Check</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            editingService === service.id && localServiceValues[service.id]?.avg_check !== undefined
                              ? localServiceValues[service.id].avg_check
                              : service.avg_check ?? 0
                          }
                          onFocus={() => setEditingService(service.id)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setLocalServiceValues({
                              ...localServiceValues,
                              [service.id]: { ...localServiceValues[service.id], avg_check: val }
                            });
                          }}
                          onBlur={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            if (val !== service.avg_check) {
                              handleServiceUpdate(service.id, { avg_check: val });
                            }
                            setEditingService(null);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Food %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={
                            editingService === service.id && localServiceValues[service.id]?.food_pct !== undefined
                              ? localServiceValues[service.id].food_pct
                              : service.food_pct ?? 60
                          }
                          onFocus={() => setEditingService(service.id)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setLocalServiceValues({
                              ...localServiceValues,
                              [service.id]: { ...localServiceValues[service.id], food_pct: val }
                            });
                          }}
                          onBlur={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            if (val !== service.food_pct) {
                              handleServiceUpdate(service.id, { food_pct: val });
                            }
                            setEditingService(null);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Bev %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={
                            editingService === service.id && localServiceValues[service.id]?.bev_pct !== undefined
                              ? localServiceValues[service.id].bev_pct
                              : service.bev_pct ?? 35
                          }
                          onFocus={() => setEditingService(service.id)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setLocalServiceValues({
                              ...localServiceValues,
                              [service.id]: { ...localServiceValues[service.id], bev_pct: val }
                            });
                          }}
                          onBlur={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            if (val !== service.bev_pct) {
                              handleServiceUpdate(service.id, { bev_pct: val });
                            }
                            setEditingService(null);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Other %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={
                            editingService === service.id && localServiceValues[service.id]?.other_pct !== undefined
                              ? localServiceValues[service.id].other_pct
                              : service.other_pct ?? 5
                          }
                          onFocus={() => setEditingService(service.id)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setLocalServiceValues({
                              ...localServiceValues,
                              [service.id]: { ...localServiceValues[service.id], other_pct: val }
                            });
                          }}
                          onBlur={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            if (val !== service.other_pct) {
                              handleServiceUpdate(service.id, { other_pct: val });
                            }
                            setEditingService(null);
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* STATE B: Center-Level View */}
                {state === 'B' && (
                  <>
                    {/* Derived Total with Breakdown (Read-Only) */}
                    <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-xs text-zinc-500">
                            Total Covers/Service (Calculated from centers)
                          </div>
                          <div className="text-lg font-bold text-black">{derivedTotal.toFixed(1)}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAutoCalculateCovers(service)}
                          className="text-xs h-7"
                        >
                          Recalculate
                        </Button>
                      </div>
                      {(() => {
                        const regularCovers = covers
                          .filter(c => c.service_period_id === service.id)
                          .reduce((sum, c) => sum + c.covers_per_service, 0);
                        const barGuests = participation
                          .filter(p => p.service_period_id === service.id && p.bar_guests)
                          .reduce((sum, p) => sum + (p.bar_guests || 0), 0);
                        const pdrCovers = participation
                          .filter(p => p.service_period_id === service.id && p.pdr_covers)
                          .reduce((sum, p) => sum + (p.pdr_covers || 0), 0);

                        // Only show breakdown if there are bar guests or PDR covers
                        if (barGuests > 0 || pdrCovers > 0) {
                          return (
                            <div className="text-xs text-zinc-600 space-y-0.5">
                              {regularCovers > 0 && (
                                <div>Dining: {regularCovers.toFixed(1)} cvrs</div>
                              )}
                              {barGuests > 0 && (
                                <div className="text-amber-700">Bar (Throughput): {barGuests.toFixed(1)} guests</div>
                              )}
                              {pdrCovers > 0 && (
                                <div className="text-purple-700">PDR (Events): {pdrCovers.toFixed(1)} cvrs</div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Service-Level Inputs (Still Editable) */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs text-zinc-600">Avg Check</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={service.avg_check ?? 0}
                          onChange={(e) => handleServiceUpdate(service.id, { avg_check: parseFloat(e.target.value) || 0 })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Food %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={service.food_pct ?? 60}
                          onChange={(e) => handleServiceUpdate(service.id, { food_pct: parseFloat(e.target.value) || 0 })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Bev %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={service.bev_pct ?? 35}
                          onChange={(e) => handleServiceUpdate(service.id, { bev_pct: parseFloat(e.target.value) || 0 })}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-600">Other %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={service.other_pct ?? 5}
                          onChange={(e) => handleServiceUpdate(service.id, { other_pct: parseFloat(e.target.value) || 0 })}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    {/* Service-Level Utilization */}
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-amber-900">Utilization % (All Centers)</div>
                            <div className="text-xs text-amber-700">Default utilization for all centers in this service</div>
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="65"
                              disabled={individualUtilMode[service.id]}
                              value={individualUtilMode[service.id] ? '' : (localServiceUtilValues[service.id] ?? service.default_utilization_pct ?? 65)}
                              onChange={(e) => {
                                setLocalServiceUtilValues({
                                  ...localServiceUtilValues,
                                  [service.id]: parseFloat(e.target.value) || 0
                                });
                              }}
                              onBlur={async (e) => {
                                const newUtil = parseFloat(e.target.value);
                                if (!newUtil || newUtil < 0 || newUtil > 100) {
                                  const { [service.id]: _, ...rest } = localServiceUtilValues;
                                  setLocalServiceUtilValues(rest);
                                  return;
                                }

                                try {
                                  // Update all centers for this service
                                  const updatePromises = serviceCovers.map(cover =>
                                    fetch("/api/proforma/center-service-metrics", {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        revenue_center_id: cover.revenue_center_id,
                                        service_period_id: service.id,
                                        utilization_pct: newUtil,
                                      }),
                                    })
                                  );

                                  await Promise.all(updatePromises);

                                  // Refetch participation
                                  const participationResponse = await fetch(`/api/proforma/center-participation?scenario_id=${scenarioId}`);
                                  if (participationResponse.ok) {
                                    const participationData = await participationResponse.json();
                                    const participationArray = participationData.participation || [];
                                    setParticipation(participationArray);
                                    await handleAutoCalculateCovers(service, participationArray);
                                  }

                                  // Clear local state
                                  const { [service.id]: _, ...rest } = localServiceUtilValues;
                                  setLocalServiceUtilValues(rest);
                                } catch (error) {
                                  console.error('Error updating service utilization:', error);
                                  alert('Error updating utilization');
                                }
                              }}
                              className={`h-9 text-sm text-center ${individualUtilMode[service.id] ? 'bg-zinc-100 text-zinc-400' : ''}`}
                              title="Set utilization for all centers"
                            />
                          </div>
                        </div>
                        {/* Service-level summary */}
                        {(() => {
                          const maxTurns = calculateTurns(service.service_hours || 3.0, service.avg_dining_time_hours || 1.5);
                          const currentUtil = localServiceUtilValues[service.id] ?? service.default_utilization_pct ?? 65;
                          const totalSeats = serviceCovers.reduce((sum, cover) => {
                            const center = centers.find(c => c.id === cover.revenue_center_id);
                            return sum + (center?.seats || 0);
                          }, 0);
                          const effectiveTurns = (currentUtil / 100) * maxTurns;
                          const totalCovers = totalSeats * effectiveTurns;

                          return (
                            <div className="flex items-center gap-6 text-xs pt-2 border-t border-amber-300">
                              <div>
                                <span className="text-amber-700">Total Seats: </span>
                                <span className="font-semibold text-amber-900">{totalSeats}</span>
                              </div>
                              <div>
                                <span className="text-amber-700">Effective Turns: </span>
                                <span className="font-semibold text-amber-900">{effectiveTurns.toFixed(2)}</span>
                                <span className="text-amber-600 ml-1">(max {maxTurns.toFixed(2)})</span>
                              </div>
                              <div>
                                <span className="text-amber-700">Est. Covers: </span>
                                <span className="font-semibold text-amber-900">{totalCovers.toFixed(1)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer pl-3">
                        <input
                          type="checkbox"
                          checked={individualUtilMode[service.id] || false}
                          onChange={(e) => {
                            setIndividualUtilMode({
                              ...individualUtilMode,
                              [service.id]: e.target.checked
                            });
                          }}
                          className="w-4 h-4"
                        />
                        <span>Override individual centers</span>
                      </label>
                    </div>

                    {/* Expandable Center Breakdown */}
                    <div>
                      <button
                        onClick={() => setExpandedServices(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(service.id)) {
                            newSet.delete(service.id);
                          } else {
                            newSet.add(service.id);
                          }
                          return newSet;
                        })}
                        className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-black"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        Covers by Center ({serviceCovers.length} active)
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-2 pl-6">
                          {/* Regular Dining Centers */}
                          {(() => {
                            // Get all active centers for this service (not just those with cover records)
                            const activeCenters = participation
                              .filter(p => p.service_period_id === service.id && p.is_active)
                              .map(p => {
                                const center = centers.find(c => c.id === p.revenue_center_id);
                                const coverRecord = serviceCovers.find(c => c.revenue_center_id === p.revenue_center_id);
                                return { center, participation: p, coverRecord };
                              })
                              .filter(item => item.center && !item.center.is_pdr); // Exclude PDRs (they're shown separately)

                            return activeCenters.map(({ center, participation: centerParticipation, coverRecord }) => {
                              if (!center) return null;

                              // Skip bars in standing mode (they're shown in the throughput section)
                              const effectiveBarMode = centerParticipation.bar_mode_override || center.bar_mode;
                              if (center.is_bar && effectiveBarMode === 'standing') {
                                return null;
                              }

                              const covers = coverRecord?.covers_per_service || 0;
                              const centerUtil = centerParticipation.default_utilization_pct ?? 65;
                              const actualUtil = covers > 0 ? getUtilization(covers, center.seats) : 0;
                              const maxTurns = calculateTurns(service.service_hours || 3.0, service.avg_dining_time_hours || 1.5);
                              const effectiveTurns = covers > 0 ? covers / center.seats : 0;

                            return (
                              <div key={`${center.id}-${service.id}`} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 p-2 bg-zinc-50 rounded">
                                <div>
                                  <div className="text-sm font-medium text-black flex items-center gap-2">
                                    {center.center_name}
                                    {(() => {
                                      if (!(center as any).is_bar) return null;

                                      // Get effective bar mode from participation
                                      const partRecord = participation.find(p =>
                                        p.revenue_center_id === center.id &&
                                        p.service_period_id === service.id
                                      );
                                      const effectiveMode = partRecord?.bar_mode_override || (center as any).bar_mode;

                                      if (effectiveMode === 'seated') {
                                        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">S</span>;
                                      }
                                    })()}
                                  </div>
                                  <div className="text-xs text-zinc-500">{center.seats} seats</div>
                                </div>
                                <div className="w-20">
                                  <div className="text-xs text-zinc-500 mb-0.5">Util %</div>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="5"
                                    disabled={!individualUtilMode[service.id]}
                                    value={localUtilValues[center.id] ?? centerUtil}
                                    onChange={(e) => {
                                      if (!individualUtilMode[service.id]) return;
                                      setLocalUtilValues({
                                        ...localUtilValues,
                                        [center.id]: parseFloat(e.target.value) || 0
                                      });
                                    }}
                                    onBlur={async (e) => {
                                      if (!individualUtilMode[service.id]) return;

                                      const newUtil = parseFloat(e.target.value) || 65;
                                      if (newUtil === centerUtil || newUtil < 0 || newUtil > 100) {
                                        // No change or invalid, just clear local state
                                        const { [center.id]: _, ...rest } = localUtilValues;
                                        setLocalUtilValues(rest);
                                        return;
                                      }

                                      try {
                                        // Update participation
                                        const response = await fetch("/api/proforma/center-service-metrics", {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            revenue_center_id: center.id,
                                            service_period_id: service.id,
                                            utilization_pct: newUtil,
                                          }),
                                        });

                                        if (!response.ok) {
                                          let errorMsg = `HTTP ${response.status}`;
                                          try {
                                            const errorData = await response.json();
                                            console.error('Failed to update utilization:', errorData);
                                            errorMsg = errorData.error || errorData.details || errorMsg;
                                          } catch (e) {
                                            console.error('Could not parse error response');
                                          }
                                          alert(`Failed to update utilization: ${errorMsg}`);
                                          return;
                                        }

                                        // Refetch participation to get updated utilization values
                                        const participationResponse = await fetch(`/api/proforma/center-participation?scenario_id=${scenarioId}`);
                                        if (!participationResponse.ok) {
                                          console.error('Failed to refetch participation');
                                          return;
                                        }

                                        const participationData = await participationResponse.json();
                                        const participationArray = participationData.participation || [];
                                        setParticipation(participationArray);

                                        // Clear local state
                                        const { [center.id]: _, ...rest } = localUtilValues;
                                        setLocalUtilValues(rest);

                                        // Recalculate this service's covers using the freshly fetched participation data
                                        await handleAutoCalculateCovers(service, participationArray);
                                      } catch (error) {
                                        console.error('Error updating utilization:', error);
                                        alert('Error updating utilization');
                                      }
                                    }}
                                    className={`h-8 text-sm text-center ${!individualUtilMode[service.id] ? 'bg-zinc-100 text-zinc-500' : ''}`}
                                    title={individualUtilMode[service.id] ? "Target utilization %" : "Enable 'Override individual centers' to edit"}
                                  />
                                </div>
                                <div className="w-28 text-center">
                                  <div className="text-xs text-zinc-500 mb-0.5">Turns</div>
                                  <div className="text-sm font-semibold text-black">
                                    {effectiveTurns.toFixed(2)}
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    max {maxTurns.toFixed(2)}
                                  </div>
                                </div>
                                <div className="w-24 text-center">
                                  <div className="text-xs text-zinc-500 mb-0.5">Covers</div>
                                  <div className="text-sm font-semibold text-black">
                                    {covers.toFixed(1)}
                                  </div>
                                </div>
                              </div>
                            );
                          })})()}

                          {/* Standing Bar Centers (Throughput) */}
                          {participation
                            .filter(p => p.service_period_id === service.id && p.bar_guests && p.bar_guests > 0)
                            .map(p => {
                              const center = centers.find(c => c.id === p.revenue_center_id);
                              if (!center) return null;

                              return (
                                <div key={`bar-${p.revenue_center_id}`} className="flex items-center gap-3 p-2 bg-amber-50 rounded border border-amber-200">
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-black flex items-center gap-2">
                                      {center.center_name}
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">T</span>
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                      {p.avg_spend_per_guest ? `$${p.avg_spend_per_guest.toFixed(0)}/guest` : 'Throughput-based'}
                                      {p.bar_food_pct && p.bar_bev_pct && (
                                        <span className="ml-2">• F: {p.bar_food_pct.toFixed(0)}% / B: {p.bar_bev_pct.toFixed(0)}%</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-end">
                                      <span className="text-sm font-semibold text-amber-700">
                                        {Math.round(p.bar_guests)} guests
                                      </span>
                                      {p.bar_revenue && (
                                        <span className="text-xs text-[#D4AF37]">
                                          ${p.bar_revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}/service
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openMetricsEditor(p.revenue_center_id, service.id)}
                                      className="h-5 w-5 p-0 text-zinc-500 hover:text-blue-600"
                                      title="Configure bar metrics"
                                    >
                                      ⚙
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}

                          {/* PDR Centers (Event-based) */}
                          {participation
                            .filter(p => {
                              const center = centers.find(c => c.id === p.revenue_center_id);
                              return p.service_period_id === service.id && p.is_active && center?.is_pdr;
                            })
                            .map(p => {
                              const center = centers.find(c => c.id === p.revenue_center_id);
                              if (!center) return null;

                              return (
                                <div key={`pdr-${p.revenue_center_id}`} className="flex items-center gap-3 p-2 bg-purple-50 rounded border border-purple-200">
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-black flex items-center gap-2">
                                      {center.center_name}
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">PDR</span>
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                      {p.events_per_service
                                        ? `${(p.events_per_service * (service.operating_days?.length || 7)).toFixed(1)} events/week`
                                        : 'Event-based'}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-end">
                                      <span className={`text-sm font-semibold ${p.pdr_covers ? 'text-purple-700' : 'text-zinc-400'}`}>
                                        {p.pdr_covers ? (p.pdr_covers * (service.operating_days?.length || 7)).toFixed(1) : '0.0'} cvrs/wk
                                      </span>
                                      {p.pdr_revenue && (
                                        <span className="text-xs text-[#D4AF37]">
                                          ${(p.pdr_revenue * (service.operating_days?.length || 7)).toLocaleString('en-US', { maximumFractionDigits: 0 })}/wk
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openMetricsEditor(p.revenue_center_id, service.id)}
                                      className="h-5 w-5 p-0 text-zinc-500 hover:text-blue-600"
                                      title="Configure PDR metrics"
                                    >
                                      ⚙
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Day of Week Distribution */}
                <div className="pt-3 border-t border-zinc-300">
                  <div className="text-sm font-semibold text-black mb-3">Sales Distribution by Day</div>

                  {(() => {
                    const distribution = service.day_of_week_distribution || [14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2];
                    const operatingDays = service.operating_days || [0, 1, 2, 3, 4, 5, 6];
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const totalPct = distribution.reduce((sum, val) => sum + val, 0);
                    const weeklyCovers = (state === 'A' ? (service.avg_covers_per_service || 0) : derivedTotal) * (operatingDays.length || 7);
                    const weeklyRevenue = weeklyCovers * (service.avg_check || 0);

                    return (
                      <>
                        {/* Preset Buttons */}
                        <div className="flex gap-2 flex-wrap mb-3">
                          <span className="text-xs text-zinc-500 self-center">Presets:</span>
                          <Button variant="outline" size="sm" onClick={() => applyDistributionPreset(service.id, 'even', operatingDays)} className="h-7 text-xs">
                            Even
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => applyDistributionPreset(service.id, 'weekday-biased', operatingDays)} className="h-7 text-xs">
                            Weekday-Biased
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => applyDistributionPreset(service.id, 'weekend-biased', operatingDays)} className="h-7 text-xs">
                            Weekend-Biased
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => applyDistributionPreset(service.id, 'fri-sat-lift', operatingDays)} className="h-7 text-xs">
                            Fri/Sat Lift
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => applyDistributionPreset(service.id, 'thu-sat-core', operatingDays)} className="h-7 text-xs">
                            Thu–Sat Core
                          </Button>
                        </div>

                        {/* Day Distribution Sliders */}
                        <div className="space-y-2">
                  {dayNames.map((day, idx) => {
                    const isOperating = operatingDays.includes(idx);
                    const dayCovers = weeklyCovers * (distribution[idx] / 100);
                    const dayRevenue = dayCovers * (service.avg_check || 0);

                    return (
                      <div key={day} className="flex items-center gap-3">
                        <div className={`w-12 text-xs font-medium ${isOperating ? 'text-black' : 'text-zinc-400'}`}>
                          {day}
                        </div>
                        <div className="flex-1">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.5"
                            value={distribution[idx]}
                            disabled={!isOperating}
                            onChange={async (e) => {
                              const newValue = parseFloat(e.target.value);
                              const oldValue = distribution[idx];
                              const delta = newValue - oldValue;

                              // Create new distribution
                              const newDist = [...distribution];
                              newDist[idx] = newValue;

                              // If we increased this day, proportionally decrease other operating days
                              if (delta !== 0) {
                                const otherOperatingIndices = operatingDays.filter(i => i !== idx);
                                const otherTotal = otherOperatingIndices.reduce((sum, i) => sum + distribution[i], 0);

                                if (otherTotal > 0 && otherOperatingIndices.length > 0) {
                                  // Distribute the delta proportionally
                                  otherOperatingIndices.forEach(i => {
                                    const proportion = distribution[i] / otherTotal;
                                    const adjustment = delta * proportion;
                                    newDist[i] = Math.max(0, distribution[i] - adjustment);
                                  });

                                  // Normalize to exactly 100%
                                  const currentTotal = newDist.reduce((sum, val) => sum + val, 0);
                                  if (currentTotal !== 100 && currentTotal > 0) {
                                    const factor = 100 / currentTotal;
                                    newDist.forEach((val, i) => {
                                      if (operatingDays.includes(i)) {
                                        newDist[i] = val * factor;
                                      }
                                    });
                                  }

                                  // Round to 1 decimal
                                  newDist.forEach((val, i) => {
                                    newDist[i] = Math.round(val * 10) / 10;
                                  });

                                  // Final adjustment to ensure exactly 100%
                                  const finalTotal = newDist.reduce((sum, val) => sum + val, 0);
                                  if (Math.abs(finalTotal - 100) > 0.01 && operatingDays.length > 0) {
                                    const diff = 100 - finalTotal;
                                    newDist[operatingDays[0]] += diff;
                                    newDist[operatingDays[0]] = Math.round(newDist[operatingDays[0]] * 10) / 10;
                                  }
                                }
                              }

                              // Optimistic update
                              setServices(prev => prev.map(s =>
                                s.id === service.id ? { ...s, day_of_week_distribution: newDist } : s
                              ));

                              try {
                                await fetch("/api/proforma/service-periods", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    id: service.id,
                                    day_of_week_distribution: newDist,
                                  }),
                                });
                              } catch (error) {
                                console.error("Error updating distribution:", error);
                                // Revert on error
                                await loadData();
                              }
                            }}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: isOperating
                                ? `linear-gradient(to right, #D4AF37 0%, #D4AF37 ${distribution[idx]}%, #e5e5e5 ${distribution[idx]}%, #e5e5e5 100%)`
                                : '#f5f5f5',
                              opacity: isOperating ? 1 : 0.5,
                            }}
                          />
                        </div>
                        <div className="w-16 text-right">
                          <span className={`text-sm font-mono ${isOperating ? 'text-black' : 'text-zinc-400'}`}>
                            {distribution[idx].toFixed(1)}%
                          </span>
                        </div>
                        {isOperating && (
                          <>
                            <div className="w-20 text-right">
                              <span className="text-xs text-zinc-600">
                                {dayCovers.toFixed(0)} cvrs
                              </span>
                            </div>
                            <div className="w-24 text-right">
                              <span className="text-xs font-semibold text-black">
                                ${dayRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                        <div className={`text-xs pt-2 border-t border-zinc-200 ${Math.abs(totalPct - 100) < 0.2 ? 'text-[#D4AF37]' : 'text-red-600'}`}>
                          Total: {totalPct.toFixed(1)}% {Math.abs(totalPct - 100) < 0.2 ? '✓' : '(must equal 100%)'}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Revenue Impact (All States) */}
                <div className="pt-3 border-t border-zinc-300">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-zinc-500">Weekly Revenue</div>
                      <div className="text-lg font-bold text-[#D4AF37]">
                        ${weeklyRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Monthly Revenue</div>
                      <div className="text-base font-semibold text-black">
                        ${monthlyRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Annual Revenue</div>
                      <div className="text-base font-semibold text-black">
                        ${annualRev.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Food: {service.food_pct || 60}% · Bev: {service.bev_pct || 35}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Center-Service Metrics Editor Dialog */}
      <Dialog open={metricsEditorOpen} onOpenChange={setMetricsEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMetrics && (() => {
                const center = centers.find(c => c.id === selectedMetrics.centerId);
                const service = services.find(s => s.id === selectedMetrics.serviceId);
                return `${center?.center_name || 'Center'} × ${service?.service_name || 'Service'}`;
              })()}
            </DialogTitle>
          </DialogHeader>
          {selectedMetrics && (
            <CenterServiceMetricsEditor
              scenarioId={scenarioId}
              centerId={selectedMetrics.centerId}
              serviceId={selectedMetrics.serviceId}
              onClose={closeMetricsEditor}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
