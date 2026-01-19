"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Calculator } from "lucide-react";

interface RevenueCenter {
  id: string;
  center_name: string;
  seats: number;
  is_bar: boolean;
  bar_mode: 'seated' | 'standing' | 'none';
  is_pdr?: boolean;
  max_seats?: number | null;
}

interface ServicePeriod {
  id: string;
  service_name: string;
  service_hours: number;
  avg_dining_time_hours: number;
  default_utilization_pct: number;
}

interface CenterServiceMetrics {
  revenue_center_id: string;
  service_period_id: string;
  is_active: boolean;
  bar_mode_override?: 'seated' | 'standing' | 'none' | null;

  // Mutually exclusive
  covers?: number | null;
  bar_guests?: number | null;

  // Seated bar
  avg_dwell_hours_seated?: number | null;
  bar_utilization_pct?: number | null;

  // Standing bar throughput
  guests_per_hour?: number | null;
  active_hours?: number | null;
  standing_capacity?: number | null;
  avg_dwell_hours?: number | null; // standing dwell
  utilization_pct?: number | null; // regular centers

  // Standing capacity sqft calculation
  standing_factor?: number | null;
  sqft_per_person?: number | null;
  net_standing_area_sqft?: number | null;
  calculated_standing_capacity?: number | null;
  bar_rail_ft_per_guest?: number | null;

  // PDR event-based metrics
  events_per_service?: number | null;
  avg_guests_per_event?: number | null;
  pricing_model?: 'per_guest' | 'minimum_spend' | null;
  avg_spend_per_guest?: number | null;
  min_spend_per_event?: number | null;
  realization_rate?: number | null;
  pdr_covers?: number | null;
  pdr_revenue?: number | null;
}

interface RevenueCenterWithBarArea extends RevenueCenter {
  bar_zone_area_sqft?: number | null;
  bar_zone_depth_ft?: number | null;
}

interface CenterServiceMetricsEditorProps {
  scenarioId: string;
  centerId: string;
  serviceId: string;
  onClose: () => void;
}

export function CenterServiceMetricsEditor({
  scenarioId,
  centerId,
  serviceId,
  onClose,
}: CenterServiceMetricsEditorProps) {
  const [center, setCenter] = useState<RevenueCenterWithBarArea | null>(null);
  const [service, setService] = useState<ServicePeriod | null>(null);
  const [metrics, setMetrics] = useState<CenterServiceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [centerId, serviceId]);

  const loadData = async () => {
    try {
      const [centerRes, serviceRes, metricsRes] = await Promise.all([
        fetch(`/api/proforma/revenue-centers?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/service-periods?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/center-participation?scenario_id=${scenarioId}`),
      ]);

      const [centerData, serviceData, metricsData] = await Promise.all([
        centerRes.json(),
        serviceRes.json(),
        metricsRes.ok ? metricsRes.json() : { participation: [] },
      ]);

      const foundCenter = centerData.centers?.find((c: RevenueCenter) => c.id === centerId);
      const foundService = serviceData.servicePeriods?.find((s: ServicePeriod) => s.id === serviceId);
      const foundMetrics = metricsData.participation?.find(
        (m: CenterServiceMetrics) => m.revenue_center_id === centerId && m.service_period_id === serviceId
      );

      setCenter(foundCenter || null);
      setService(foundService || null);
      setMetrics(foundMetrics || null);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get effective bar mode
  const getEffectiveBarMode = (): 'seated' | 'standing' | 'none' => {
    return metrics?.bar_mode_override ?? center?.bar_mode ?? 'none';
  };

  const effectiveBarMode = getEffectiveBarMode();

  // Calculate derived metrics
  const calculateSeatedBarMetrics = () => {
    if (!center || !service || !metrics?.avg_dwell_hours_seated || !metrics?.bar_utilization_pct) {
      return null;
    }

    const turns = service.service_hours / metrics.avg_dwell_hours_seated;
    const covers = center.seats * turns * (metrics.bar_utilization_pct / 100);

    return {
      turns: turns.toFixed(2),
      covers: covers.toFixed(1),
    };
  };

  // Calculate standing capacity from sqft
  const calculateStandingCapacityFromSqft = () => {
    if (!center?.bar_zone_area_sqft || !metrics?.standing_factor || !metrics?.sqft_per_person) {
      return null;
    }

    const nsa = center.bar_zone_area_sqft * metrics.standing_factor;
    const capacity = Math.floor(nsa / metrics.sqft_per_person);

    // Bar rail support check
    const linearFeet = center.seats * 2.0; // rough: 2 ft per seat
    const railFtPerGuest = metrics.bar_rail_ft_per_guest || 2.0;
    const railSupportedGuests = Math.floor(linearFeet / railFtPerGuest);
    const capacityRatio = capacity / (railSupportedGuests || 1);

    return {
      nsa: nsa.toFixed(1),
      capacity,
      railSupportedGuests,
      railWarning: capacityRatio > 4
        ? `Capacity (${capacity}) far exceeds rail support (${railSupportedGuests}). Ordering friction risk.`
        : capacityRatio > 3
        ? `Warning: Capacity/rail ratio is high (${capacityRatio.toFixed(1)}×).`
        : null,
    };
  };

  const calculateStandingBarMetrics = () => {
    if (!metrics?.active_hours) return null;

    // Use calculated or manual capacity
    const capacity = metrics.standing_capacity ?? metrics.calculated_standing_capacity;

    // Method 1: guests_per_hour × active_hours
    if (metrics.guests_per_hour) {
      return {
        bar_guests: (metrics.guests_per_hour * metrics.active_hours).toFixed(1),
        method: 'throughput',
      };
    }

    // Method 2: capacity × (active_hours / dwell) × utilization
    if (capacity && metrics.avg_dwell_hours) {
      const turns = metrics.active_hours / metrics.avg_dwell_hours;
      const utilization = metrics.utilization_pct ? metrics.utilization_pct / 100 : 1.0;
      const bar_guests = capacity * turns * utilization;

      return {
        bar_guests: bar_guests.toFixed(1),
        turns: turns.toFixed(2),
        method: 'capacity',
        capacity,
      };
    }

    return null;
  };

  // Preset functions
  const applyStandingPreset = (preset: 'conservative' | 'normal' | 'aggressive') => {
    const presets = {
      conservative: { standing_factor: 0.50, label: 'Conservative' },
      normal: { standing_factor: 0.60, label: 'Normal' },
      aggressive: { standing_factor: 0.70, label: 'Aggressive' },
    };
    setMetrics(prev => prev ? { ...prev, standing_factor: presets[preset].standing_factor } : null);
  };

  const applyDensityPreset = (preset: 'comfortable' | 'busy' | 'packed') => {
    const presets = {
      comfortable: { sqft_per_person: 14, label: 'Comfortable' },
      busy: { sqft_per_person: 12, label: 'Busy' },
      packed: { sqft_per_person: 9, label: 'Packed (warning)' },
    };
    setMetrics(prev => prev ? { ...prev, sqft_per_person: presets[preset].sqft_per_person } : null);
  };

  const applyDwellPreset = (preset: 'lounge' | 'nightlife' | 'club') => {
    const presets = {
      lounge: { avg_dwell_hours: 1.25, label: 'Cocktail Lounge' },
      nightlife: { avg_dwell_hours: 1.0, label: 'Nightlife Bar' },
      club: { avg_dwell_hours: 0.75, label: 'Club (warning)' },
    };
    setMetrics(prev => prev ? { ...prev, avg_dwell_hours: presets[preset].avg_dwell_hours } : null);
  };

  // PDR PRESET FUNCTIONS
  const applyPDREventsPreset = (preset: 'conservative' | 'normal' | 'strong' | 'exceptional') => {
    const presets = {
      conservative: 0.15,  // ~1 event/week
      normal: 0.35,        // 2-3 events/week
      strong: 0.60,        // 4-5 events/week
      exceptional: 0.85,   // ~6 events/week
    };
    setMetrics(prev => prev ? { ...prev, events_per_service: presets[preset], realization_rate: prev.realization_rate || 0.90 } : null);
  };

  const applyPDRGuestsPreset = (preset: 'small' | 'medium' | 'large') => {
    // Dynamic presets based on max_seats
    const maxSeats = center?.max_seats || 60;
    const presets = {
      small: Math.round(maxSeats * 0.5),   // 50% of capacity
      medium: Math.round(maxSeats * 0.75), // 75% of capacity
      large: maxSeats,                      // 100% of capacity
    };
    setMetrics(prev => prev ? { ...prev, avg_guests_per_event: presets[preset] } : null);
  };

  const applyPDRRealizationPreset = (preset: 'conservative' | 'default' | 'aggressive') => {
    const presets = {
      conservative: 0.85,
      default: 0.90,
      aggressive: 0.95,
    };
    setMetrics(prev => prev ? { ...prev, realization_rate: presets[preset] } : null);
  };

  // PDR CALCULATION
  const calculatePDRMetrics = () => {
    if (!metrics?.events_per_service || !metrics?.avg_guests_per_event) {
      return null;
    }

    const covers = metrics.events_per_service * metrics.avg_guests_per_event;
    const realization = metrics.realization_rate || 0.90;

    let revenue: number | null = null;

    if (metrics.pricing_model === 'per_guest' && metrics.avg_spend_per_guest) {
      revenue = covers * metrics.avg_spend_per_guest * realization;
    } else if (metrics.pricing_model === 'minimum_spend' && metrics.min_spend_per_event) {
      revenue = metrics.events_per_service * metrics.min_spend_per_event * realization;
    }

    // If both pricing models provided, take max
    if (metrics.avg_spend_per_guest && metrics.min_spend_per_event) {
      const perGuestRev = covers * metrics.avg_spend_per_guest * realization;
      const minSpendRev = metrics.events_per_service * metrics.min_spend_per_event * realization;
      revenue = Math.max(perGuestRev, minSpendRev);
    }

    return {
      covers: covers.toFixed(1),
      revenue: revenue ? revenue.toFixed(0) : null,
      eventsPerWeek: (metrics.events_per_service * 7).toFixed(1), // Assuming daily services
      revenuePerEvent: revenue && metrics.events_per_service ? (revenue / metrics.events_per_service).toFixed(0) : null,
    };
  };

  const validateMetrics = (): string[] => {
    const errors: string[] = [];

    if (effectiveBarMode === 'seated') {
      if (metrics?.avg_dwell_hours_seated) {
        if (metrics.avg_dwell_hours_seated < 0.5) {
          errors.push("Seated bar dwell time must be at least 0.5 hours");
        } else if (metrics.avg_dwell_hours_seated < 1.0) {
          errors.push("Warning: Seated bar dwell time below 1.0 hour is unusual");
        }

        if (service) {
          const turns = service.service_hours / metrics.avg_dwell_hours_seated;
          if (turns > 4.5) {
            errors.push(`Turns (${turns.toFixed(2)}) exceed maximum of 4.5`);
          }
        }
      }

      if (metrics?.bar_utilization_pct) {
        if (metrics.bar_utilization_pct > 95) {
          errors.push("Utilization cannot exceed 95%");
        } else if (metrics.bar_utilization_pct > 90) {
          errors.push("Warning: Utilization above 90% is very aggressive");
        }
      }
    }

    if (effectiveBarMode === 'standing') {
      if (!metrics?.active_hours || metrics.active_hours <= 0) {
        errors.push("Standing bar requires active_hours > 0");
      }

      const calc = calculateStandingBarMetrics();
      if (calc && metrics?.standing_capacity && metrics?.avg_dwell_hours) {
        const maxThroughput = metrics.standing_capacity * (metrics.active_hours! / metrics.avg_dwell_hours);
        const impliedUtilization = (parseFloat(calc.bar_guests) / maxThroughput) * 100;

        if (impliedUtilization > 90) {
          errors.push(`Warning: Implied utilization (${impliedUtilization.toFixed(1)}%) exceeds 90% (fire code / staffing risk)`);
        }
      }
    }

    // PDR VALIDATIONS
    if (center?.is_pdr) {
      // HARD validations
      if (metrics?.events_per_service && metrics.events_per_service > 0) {
        if (!metrics.avg_guests_per_event || metrics.avg_guests_per_event <= 0) {
          errors.push("PDR: avg_guests_per_event required when events_per_service > 0");
        }

        // Check physical capacity
        if (center.max_seats && metrics.avg_guests_per_event && metrics.avg_guests_per_event > center.max_seats) {
          errors.push(`PDR: avg_guests (${metrics.avg_guests_per_event}) exceeds max_seats (${center.max_seats})`);
        }
      }

      // Pricing model validations
      if (metrics?.pricing_model === 'per_guest') {
        if (!metrics.avg_spend_per_guest || metrics.avg_spend_per_guest <= 0) {
          errors.push("PDR: avg_spend_per_guest required for per_guest pricing model");
        }
      } else if (metrics?.pricing_model === 'minimum_spend') {
        if (!metrics.min_spend_per_event || metrics.min_spend_per_event <= 0) {
          errors.push("PDR: min_spend_per_event required for minimum_spend pricing model");
        }
      }

      // SOFT validations (warnings)
      if (metrics?.events_per_service && metrics.events_per_service > 1.0) {
        errors.push(`Warning: PDR events_per_service (${metrics.events_per_service}) > 1.0 (more than one event per service)`);
      }

      if (metrics?.realization_rate && metrics.realization_rate > 0.95) {
        errors.push(`Warning: PDR realization_rate (${(metrics.realization_rate * 100).toFixed(0)}%) exceeds 95%`);
      }

      if (service && !service.service_name.toLowerCase().includes('dinner')) {
        errors.push(`Warning: PDR active for non-dinner service (${service.service_name})`);
      }
    }

    return errors;
  };

  const handleSave = async () => {
    console.log('[CenterServiceMetricsEditor] Starting save, metrics:', metrics);

    const validationErrors = validateMetrics();
    console.log('[CenterServiceMetricsEditor] Validation errors:', validationErrors);

    const criticalErrors = validationErrors.filter(e => !e.startsWith('Warning:'));
    console.log('[CenterServiceMetricsEditor] Critical errors:', criticalErrors);

    if (criticalErrors.length > 0) {
      console.log('[CenterServiceMetricsEditor] Blocking save due to critical errors');
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      const payload = {
        revenue_center_id: centerId,
        service_period_id: serviceId,
        ...metrics,
      };
      console.log('[CenterServiceMetricsEditor] Sending PATCH request with payload:', payload);

      const response = await fetch("/api/proforma/center-service-metrics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log('[CenterServiceMetricsEditor] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[CenterServiceMetricsEditor] Save successful, response:', data);
        onClose();
      } else {
        const error = await response.json();
        console.error('[CenterServiceMetricsEditor] Save failed:', error);
        setErrors([error.error || "Failed to save metrics"]);
      }
    } catch (error) {
      console.error("[CenterServiceMetricsEditor] Error saving metrics:", error);
      setErrors(["Failed to save metrics"]);
    } finally {
      setSaving(false);
    }
  };

  const updateMetric = (field: keyof CenterServiceMetrics, value: any) => {
    setMetrics(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  if (!center || !service) {
    return <div className="text-red-600">Center or service not found</div>;
  }

  const seatedCalc = effectiveBarMode === 'seated' ? calculateSeatedBarMetrics() : null;
  const standingCalc = effectiveBarMode === 'standing' ? calculateStandingBarMetrics() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-600">
            {center.seats} seats · {service.service_hours}h service
          </p>
        </div>
        <Button onClick={onClose} variant="ghost" size="sm">
          Close
        </Button>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive" className="bg-red-50 border-red-300">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, i) => (
                <li key={i} className={error.startsWith('Warning:') ? 'text-amber-700' : 'text-red-800 font-medium'}>
                  {error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* SEATED BAR INPUTS */}
      {effectiveBarMode === 'seated' && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-4 h-4 text-blue-600" />
              <h4 className="font-medium text-blue-900">Seated Bar (Covers-Based)</h4>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-zinc-700">Seats (read-only)</Label>
                <Input
                  type="number"
                  value={center.seats}
                  disabled
                  className="bg-zinc-100"
                />
              </div>
              <div>
                <Label className="text-sm text-zinc-700">Service Hours (read-only)</Label>
                <Input
                  type="number"
                  value={service.service_hours}
                  disabled
                  className="bg-zinc-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-zinc-700">Avg Dwell Time (hours)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="4"
                  value={metrics?.avg_dwell_hours_seated ?? ''}
                  onChange={(e) => updateMetric('avg_dwell_hours_seated', parseFloat(e.target.value) || null)}
                  placeholder="e.g., 1.5"
                />
              </div>
              <div>
                <Label className="text-sm text-zinc-700">Utilization %</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="95"
                  value={metrics?.bar_utilization_pct ?? ''}
                  onChange={(e) => updateMetric('bar_utilization_pct', parseFloat(e.target.value) || null)}
                  placeholder="e.g., 70"
                />
              </div>
            </div>

            {seatedCalc && (
              <div className="p-3 bg-white rounded border border-blue-200">
                <div className="text-sm text-zinc-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Calculated Turns:</span>
                    <span className="font-medium">{seatedCalc.turns}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Calculated Covers:</span>
                    <span className="font-semibold text-blue-700">{seatedCalc.covers}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm text-zinc-700">Manual Covers Override (optional)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={metrics?.covers ?? ''}
                onChange={(e) => updateMetric('covers', parseFloat(e.target.value) || null)}
                placeholder={seatedCalc?.covers || 'Auto-calculated'}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Leave blank to use calculated value
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* STANDING BAR INPUTS */}
      {effectiveBarMode === 'standing' && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-4 h-4 text-amber-600" />
              <h4 className="font-medium text-amber-900">Standing Bar (Throughput Model)</h4>
            </div>

            <div className="text-sm text-zinc-700 bg-white p-3 rounded border border-amber-200 mb-3">
              <p className="font-medium mb-1">Choose calculation method:</p>
              <p className="text-xs">Method 1: Guests/hour × Active hours</p>
              <p className="text-xs">Method 2: Capacity × Turns × Utilization</p>
            </div>

            <div>
              <Label className="text-sm text-zinc-700">Active Hours (required)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={metrics?.active_hours ?? ''}
                onChange={(e) => updateMetric('active_hours', parseFloat(e.target.value) || null)}
                placeholder="e.g., 4.0"
              />
            </div>

            {/* Sqft-Based Capacity Calculator */}
            {center?.bar_zone_area_sqft && (
              <div className="border border-amber-300 bg-amber-100 p-3 rounded space-y-3">
                <p className="text-xs font-semibold text-amber-900">Standing Capacity Calculator (Sqft-Based)</p>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyStandingPreset('conservative')}
                    className="text-xs h-7"
                  >
                    Conservative (0.50)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyStandingPreset('normal')}
                    className="text-xs h-7"
                  >
                    Normal (0.60)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyStandingPreset('aggressive')}
                    className="text-xs h-7"
                  >
                    Aggressive (0.70)
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-zinc-700">Bar Zone Area (sqft)</Label>
                    <Input
                      type="number"
                      value={center.bar_zone_area_sqft}
                      disabled
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-700">Standing Factor</Label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={metrics?.standing_factor ?? ''}
                      onChange={(e) => updateMetric('standing_factor', parseFloat(e.target.value) || null)}
                      placeholder="0.60"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyDensityPreset('comfortable')}
                    className="text-xs h-7"
                  >
                    14 sqft/p
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyDensityPreset('busy')}
                    className="text-xs h-7"
                  >
                    12 sqft/p
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyDensityPreset('packed')}
                    className="text-xs h-7 text-red-600"
                  >
                    9 sqft/p ⚠
                  </Button>
                </div>

                <div>
                  <Label className="text-xs text-zinc-700">Sqft per Person</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={metrics?.sqft_per_person ?? ''}
                    onChange={(e) => updateMetric('sqft_per_person', parseFloat(e.target.value) || null)}
                    placeholder="12"
                    className="h-8 text-xs"
                  />
                </div>

                {calculateStandingCapacityFromSqft() && (
                  <div className="p-2 bg-white rounded border border-amber-300">
                    <div className="text-xs text-zinc-700 space-y-1">
                      <div className="flex justify-between">
                        <span>Net Standing Area:</span>
                        <span className="font-medium">{calculateStandingCapacityFromSqft()!.nsa} sqft</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold">Calculated Capacity:</span>
                        <span className="font-semibold text-amber-700">{calculateStandingCapacityFromSqft()!.capacity} people</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Rail Support:</span>
                        <span>{calculateStandingCapacityFromSqft()!.railSupportedGuests} guests</span>
                      </div>
                      {calculateStandingCapacityFromSqft()!.railWarning && (
                        <div className="text-xs text-amber-700 mt-2">
                          ⚠ {calculateStandingCapacityFromSqft()!.railWarning}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-amber-200 pt-3">
              <p className="text-xs font-medium text-zinc-700 mb-2">Throughput Calculation</p>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyDwellPreset('lounge')}
                  className="text-xs h-7"
                >
                  Lounge (1.25h)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyDwellPreset('nightlife')}
                  className="text-xs h-7"
                >
                  Nightlife (1.0h)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyDwellPreset('club')}
                  className="text-xs h-7 text-red-600"
                >
                  Club (0.75h) ⚠
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm text-zinc-700">Standing Capacity</Label>
                  <Input
                    type="number"
                    min="0"
                    value={metrics?.standing_capacity ?? ''}
                    onChange={(e) => updateMetric('standing_capacity', parseInt(e.target.value) || null)}
                    placeholder="e.g., 30"
                  />
                </div>
                <div>
                  <Label className="text-sm text-zinc-700">Avg Dwell (hours)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={metrics?.avg_dwell_hours ?? ''}
                    onChange={(e) => updateMetric('avg_dwell_hours', parseFloat(e.target.value) || null)}
                    placeholder="e.g., 0.75"
                  />
                </div>
              </div>
              <div className="mt-2">
                <Label className="text-sm text-zinc-700">Utilization %</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={metrics?.utilization_pct ?? ''}
                  onChange={(e) => updateMetric('utilization_pct', parseFloat(e.target.value) || null)}
                  placeholder="e.g., 80"
                />
              </div>
            </div>

            {standingCalc && (
              <div className="p-3 bg-white rounded border border-amber-200">
                <div className="text-sm text-zinc-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Calculation Method:</span>
                    <span className="font-medium">{standingCalc.method === 'throughput' ? 'Guests/Hour' : 'Capacity-Based'}</span>
                  </div>
                  {standingCalc.turns && (
                    <div className="flex justify-between">
                      <span>Calculated Turns:</span>
                      <span className="font-medium">{standingCalc.turns}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-semibold">Calculated Bar Guests:</span>
                    <span className="font-semibold text-amber-700">{standingCalc.bar_guests}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm text-zinc-700">Bar Guests (Hard Override)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={metrics?.bar_guests ?? ''}
                onChange={(e) => updateMetric('bar_guests', parseFloat(e.target.value) || null)}
                placeholder={standingCalc?.bar_guests ? `Leave blank for ${standingCalc.bar_guests}` : 'Enter value or leave blank for auto-calc'}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Leave blank to use calculated value based on capacity × dwell × utilization
              </p>
            </div>

            {/* Bar Revenue Section */}
            <div className="border-t border-amber-200 pt-3">
              <p className="text-xs font-medium text-zinc-700 mb-2">Revenue & F&B Split</p>

              <div>
                <Label className="text-sm text-zinc-700">Avg Spend per Guest ($)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={metrics?.avg_spend_per_guest ?? ''}
                  onChange={(e) => updateMetric('avg_spend_per_guest', parseFloat(e.target.value) || null)}
                  placeholder="18.00"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Typical: $15-25 per guest (2-3 drinks)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label className="text-sm text-zinc-700">Food %</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={metrics?.bar_food_pct ?? ''}
                    onChange={(e) => updateMetric('bar_food_pct', parseFloat(e.target.value) || null)}
                    placeholder="10"
                  />
                </div>
                <div>
                  <Label className="text-sm text-zinc-700">Beverage %</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={metrics?.bar_bev_pct ?? ''}
                    onChange={(e) => updateMetric('bar_bev_pct', parseFloat(e.target.value) || null)}
                    placeholder="90"
                  />
                </div>
              </div>

              {metrics?.bar_guests && metrics?.avg_spend_per_guest && (
                <div className="p-3 bg-white rounded border border-amber-200 mt-3">
                  <div className="text-sm text-zinc-700 space-y-1">
                    <div className="flex justify-between">
                      <span className="font-semibold">Bar Revenue/Service:</span>
                      <span className="font-semibold text-[#D4AF37]">
                        ${(metrics.bar_guests * metrics.avg_spend_per_guest).toFixed(0)}
                      </span>
                    </div>
                    {service && (
                      <div className="flex justify-between">
                        <span className="font-semibold">Bar Revenue/Week:</span>
                        <span className="font-semibold text-[#D4AF37]">
                          ${(metrics.bar_guests * metrics.avg_spend_per_guest * (service.operating_days?.length || 7)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* PDR (PRIVATE DINING ROOM) — EVENT-BASED */}
      {center.is_pdr && (
        <Card className="p-4 bg-purple-50 border-purple-200">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-purple-600" />
                <h4 className="font-medium text-purple-900">Private Dining Room (Event-Based)</h4>
              </div>
              {center.max_seats && (
                <div className="text-sm font-semibold text-purple-900 bg-purple-100 px-3 py-1 rounded">
                  Max Capacity: {center.max_seats} guests
                </div>
              )}
            </div>

            <p className="text-xs text-purple-700 bg-purple-100 p-2 rounded">
              PDRs don't turn, they book. Covers = events × avg_guests_per_event
            </p>

            {/* Events Per Service Presets */}
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-2 block">Events / Service</Label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDREventsPreset('conservative')}
                  className="text-xs h-7"
                >
                  0.15 (1/wk)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDREventsPreset('normal')}
                  className="text-xs h-7"
                >
                  0.35 (2-3/wk)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDREventsPreset('strong')}
                  className="text-xs h-7"
                >
                  0.60 (4-5/wk)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDREventsPreset('exceptional')}
                  className="text-xs h-7 text-amber-700"
                >
                  0.85 (6/wk)
                </Button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={metrics?.events_per_service ?? ''}
                onChange={(e) => updateMetric('events_per_service', parseFloat(e.target.value) || null)}
                placeholder="e.g., 0.35"
                className="h-9"
              />
            </div>

            {/* Avg Guests Per Event Presets */}
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-2 block">Avg Guests / Event</Label>
              {center.max_seats && (
                <p className="text-xs text-zinc-600 mb-2">
                  Max physical capacity: {center.max_seats} guests
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-2">
                {(() => {
                  const maxSeats = center.max_seats || 60;
                  const small = Math.round(maxSeats * 0.5);
                  const medium = Math.round(maxSeats * 0.75);
                  const large = maxSeats;

                  return (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyPDRGuestsPreset('small')}
                        className="text-xs h-7"
                      >
                        50% ({small})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyPDRGuestsPreset('medium')}
                        className="text-xs h-7"
                      >
                        75% ({medium})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyPDRGuestsPreset('large')}
                        className="text-xs h-7"
                      >
                        100% ({large})
                      </Button>
                    </>
                  );
                })()}
              </div>
              <Input
                type="number"
                min="1"
                max={center.max_seats || undefined}
                value={metrics?.avg_guests_per_event ?? ''}
                onChange={(e) => updateMetric('avg_guests_per_event', parseFloat(e.target.value) || null)}
                placeholder={center.max_seats ? `e.g., ${Math.min(32, center.max_seats)}` : "e.g., 32"}
                className="h-9"
              />
            </div>

            {/* Pricing Model */}
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-2 block">Pricing Model</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="pricing_per_guest"
                    checked={metrics?.pricing_model === 'per_guest'}
                    onChange={() => updateMetric('pricing_model', 'per_guest')}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="pricing_per_guest" className="text-sm cursor-pointer">
                    Per Guest
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="pricing_min_spend"
                    checked={metrics?.pricing_model === 'minimum_spend'}
                    onChange={() => updateMetric('pricing_model', 'minimum_spend')}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="pricing_min_spend" className="text-sm cursor-pointer">
                    Minimum Spend
                  </Label>
                </div>
              </div>
            </div>

            {/* Per Guest Pricing */}
            {metrics?.pricing_model === 'per_guest' && (
              <div>
                <Label className="text-sm text-zinc-700">Avg Spend per Guest ($)</Label>
                <Input
                  type="number"
                  min="0"
                  value={metrics?.avg_spend_per_guest ?? ''}
                  onChange={(e) => updateMetric('avg_spend_per_guest', parseFloat(e.target.value) || null)}
                  placeholder="e.g., 125"
                  className="h-9"
                />
              </div>
            )}

            {/* Minimum Spend Pricing */}
            {metrics?.pricing_model === 'minimum_spend' && (
              <div>
                <Label className="text-sm text-zinc-700">Minimum Spend per Event ($)</Label>
                <Input
                  type="number"
                  min="0"
                  value={metrics?.min_spend_per_event ?? ''}
                  onChange={(e) => updateMetric('min_spend_per_event', parseFloat(e.target.value) || null)}
                  placeholder="e.g., 6000"
                  className="h-9"
                />
              </div>
            )}

            {/* Realization Rate Presets */}
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-2 block">Realization Rate</Label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDRRealizationPreset('conservative')}
                  className="text-xs h-7"
                >
                  85%
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDRRealizationPreset('default')}
                  className="text-xs h-7"
                >
                  90% (default)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyPDRRealizationPreset('aggressive')}
                  className="text-xs h-7 text-amber-700"
                >
                  95%
                </Button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={metrics?.realization_rate ?? ''}
                onChange={(e) => updateMetric('realization_rate', parseFloat(e.target.value) || null)}
                placeholder="0.90"
                className="h-9"
              />
            </div>

            {/* Calculated PDR Metrics */}
            {calculatePDRMetrics() && (
              <div className="p-3 bg-white rounded border border-purple-200">
                <div className="text-sm text-zinc-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Expected Events/Week:</span>
                    <span className="font-medium">{calculatePDRMetrics()!.eventsPerWeek}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Expected Covers/Service:</span>
                    <span className="font-semibold text-purple-700">{calculatePDRMetrics()!.covers}</span>
                  </div>
                  {calculatePDRMetrics()!.revenue && (
                    <>
                      <div className="flex justify-between pt-2 border-t border-purple-200">
                        <span>Revenue per Event:</span>
                        <span className="font-medium">${calculatePDRMetrics()!.revenuePerEvent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold">Revenue/Service:</span>
                        <span className="font-semibold text-[#D4AF37]">${calculatePDRMetrics()!.revenue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold">Revenue/Week:</span>
                        <span className="font-semibold text-[#D4AF37]">
                          ${(parseFloat(calculatePDRMetrics()!.revenue!) * (service?.operating_days?.length || 7)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* REGULAR CENTER (NON-BAR, NON-PDR) */}
      {effectiveBarMode === 'none' && !center.is_bar && !center.is_pdr && (
        <Card className="p-4 bg-zinc-50 border-zinc-300">
          <div className="space-y-3">
            <h4 className="font-medium text-zinc-900">Dining Center Settings</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm text-zinc-700">Target Utilization %</Label>
                <Input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={metrics?.utilization_pct ?? 65}
                  onChange={(e) => updateMetric('utilization_pct', parseFloat(e.target.value) || null)}
                  placeholder="e.g., 65"
                />
                <div className="text-xs text-zinc-500 mt-1">
                  Used to auto-calculate covers from service hours × turns
                </div>
              </div>
              <div>
                <Label className="text-sm text-zinc-700">Covers per Service</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={metrics?.covers ?? ''}
                  onChange={(e) => updateMetric('covers', parseFloat(e.target.value) || null)}
                  placeholder="Auto-calculated"
                />
                <div className="text-xs text-zinc-500 mt-1">
                  Manual override (optional)
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-2 justify-end">
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Metrics'}
        </Button>
      </div>
    </div>
  );
}
