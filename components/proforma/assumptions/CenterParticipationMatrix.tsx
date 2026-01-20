"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Check, X } from "lucide-react";

interface RevenueCenter {
  id: string;
  center_name: string;
  seats: number;
  is_bar: boolean;
  bar_mode: 'seated' | 'standing' | 'none';
  is_pdr?: boolean;
  max_seats?: number;
}

interface ServicePeriod {
  id: string;
  service_name: string;
  service_hours: number;
  avg_dining_time_hours: number;
  default_utilization_pct: number;
}

interface Participation {
  revenue_center_id: string;
  service_period_id: string;
  is_active: boolean;
  utilization_pct?: number;
  bar_mode_override?: 'seated' | 'standing' | 'none' | null;

  // Mutually exclusive: covers OR bar_guests
  covers?: number | null;
  bar_guests?: number | null;

  // Seated bar fields
  avg_dwell_hours_seated?: number | null;
  bar_utilization_pct?: number | null;

  // Standing bar fields
  guests_per_hour?: number | null;
  active_hours?: number | null;
  standing_capacity?: number | null;
  avg_dwell_hours?: number | null; // standing bar dwell
}

interface CenterParticipationMatrixProps {
  scenarioId: string;
}

export function CenterParticipationMatrix({ scenarioId }: CenterParticipationMatrixProps) {
  const [centers, setCenters] = useState<RevenueCenter[]>([]);
  const [services, setServices] = useState<ServicePeriod[]>([]);
  const [participation, setParticipation] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [scenarioId]);

  const loadData = async () => {
    try {
      const [centersRes, servicesRes, participationRes] = await Promise.all([
        fetch(`/api/proforma/revenue-centers?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/service-periods?scenario_id=${scenarioId}`),
        fetch(`/api/proforma/center-participation?scenario_id=${scenarioId}`),
      ]);

      const [centersData, servicesData, participationData] = await Promise.all([
        centersRes.json(),
        servicesRes.json(),
        participationRes.ok ? participationRes.json() : { participation: [] },
      ]);

      setCenters(centersData.centers || []);
      setServices(servicesData.servicePeriods || []);
      setParticipation(participationData.participation || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const isActive = (centerId: string, serviceId: string): boolean => {
    const record = participation.find(
      (p) => p.revenue_center_id === centerId && p.service_period_id === serviceId
    );
    return record?.is_active ?? false;
  };

  const getUtilization = (centerId: string, serviceId: string): number | undefined => {
    const record = participation.find(
      (p) => p.revenue_center_id === centerId && p.service_period_id === serviceId
    );
    return record?.utilization_pct;
  };

  // Get effective bar mode (per-service override or center default)
  const getEffectiveBarMode = (centerId: string, serviceId: string): 'seated' | 'standing' | 'none' => {
    const record = participation.find(
      (p) => p.revenue_center_id === centerId && p.service_period_id === serviceId
    );
    const center = centers.find(c => c.id === centerId);

    // Use override if set, otherwise fall back to center default
    return record?.bar_mode_override ?? center?.bar_mode ?? 'none';
  };

  // Get participation record for a center-service pair
  const getParticipation = (centerId: string, serviceId: string): Participation | undefined => {
    return participation.find(
      (p) => p.revenue_center_id === centerId && p.service_period_id === serviceId
    );
  };

  // Get default utilization based on center name
  const getDefaultUtilization = (centerName: string): number => {
    const name = centerName.toLowerCase();
    if (name.includes('patio')) return 55;
    if (name.includes('bar')) return 70;
    return 65; // Dining room default
  };

  const toggleParticipation = async (centerId: string, serviceId: string) => {
    const currentState = isActive(centerId, serviceId);
    const center = centers.find(c => c.id === centerId);

    // When activating, set default utilization based on center type
    const defaultUtil = center ? getDefaultUtilization(center.center_name) : 65;

    console.log('Toggling participation:', { centerId, serviceId, currentState, defaultUtil });

    try {
      const response = await fetch("/api/proforma/center-participation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revenue_center_id: centerId,
          service_period_id: serviceId,
          is_active: !currentState,
          default_utilization_pct: !currentState ? defaultUtil : undefined, // Set default when activating
        }),
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);
        await loadData();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to update participation:', errorData);
        alert("Failed to update participation");
      }
    } catch (error) {
      console.error("Error toggling participation:", error);
      alert("Failed to update participation");
    }
  };

  const toggleBarMode = async (centerId: string, serviceId: string) => {
    const currentMode = getEffectiveBarMode(centerId, serviceId);
    const center = centers.find(c => c.id === centerId);

    // Toggle between seated and standing
    const newMode = currentMode === 'seated' ? 'standing' : 'seated';

    try {
      const response = await fetch("/api/proforma/center-service-metrics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revenue_center_id: centerId,
          service_period_id: serviceId,
          bar_mode_override: newMode,
        }),
      });

      if (response.ok) {
        await loadData();
      } else {
        alert("Failed to toggle bar mode");
      }
    } catch (error) {
      console.error("Error toggling bar mode:", error);
      alert("Failed to toggle bar mode");
    }
  };

  if (loading) {
    return <div className="text-zinc-400">Loading participation matrix...</div>;
  }

  if (centers.length === 0 || services.length === 0) {
    return (
      <div className="text-sm text-zinc-500 italic">
        Please create revenue centers and service periods first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-md font-semibold text-black mb-2">Center × Service Participation</h4>
        <p className="text-sm text-zinc-600">
          Configure which revenue centers operate during which service periods
        </p>
      </div>

      <Card className="p-4 bg-white border-zinc-200">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 border-b border-zinc-300 text-sm font-semibold text-zinc-700">
                  Revenue Center
                </th>
                {services.map((service) => (
                  <th
                    key={service.id}
                    className="text-center p-2 border-b border-zinc-300 text-sm font-semibold text-zinc-700"
                  >
                    {service.service_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centers.map((center) => (
                <tr key={center.id} className="hover:bg-zinc-50">
                  <td className="p-2 border-b border-zinc-200">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium text-black">{center.center_name}</div>
                        <div className="text-xs text-zinc-500">
                          {center.is_pdr ? `${center.seats} capacity (max ${center.max_seats})` : `${center.seats} seats`}
                        </div>
                      </div>
                      {center.is_pdr && (
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                          PDR
                        </span>
                      )}
                      {center.is_bar && (
                        <span className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                          Bar
                        </span>
                      )}
                    </div>
                  </td>
                  {services.map((service) => {
                    const active = isActive(center.id, service.id);
                    const effectiveMode = getEffectiveBarMode(center.id, service.id);
                    const hasOverride = getParticipation(center.id, service.id)?.bar_mode_override != null;

                    return (
                      <td
                        key={service.id}
                        className="p-2 border-b border-zinc-200 text-center"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => toggleParticipation(center.id, service.id)}
                            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                              active
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                            }`}
                          >
                            {active ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5" />
                            )}
                          </button>
                          {active && center.is_bar && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBarMode(center.id, service.id);
                              }}
                              className={`text-xs px-1.5 py-0.5 rounded cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all ${
                                effectiveMode === 'seated'
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 hover:ring-blue-300'
                                  : effectiveMode === 'standing'
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 hover:ring-amber-300'
                                  : 'bg-zinc-100 text-zinc-600'
                              }`}
                              title={`Click to toggle between Seated (S) and Throughput (T). Currently: ${effectiveMode}`}
                            >
                              {effectiveMode === 'seated' ? 'S' : effectiveMode === 'standing' ? 'T' : '?'}
                              {hasOverride && '*'}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-zinc-500 space-y-1">
          <div>
            <Check className="w-3 h-3 inline text-green-600" /> = Active (center operates during this service)
            · <X className="w-3 h-3 inline text-zinc-400" /> = Inactive (center closed during this service)
          </div>
          <div>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono">S</span> = Seated bar (covers-based)
            · <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">T</span> = Standing/Throughput bar (guests/hour)
            · <span className="font-mono">*</span> = Per-service override
            · <span className="italic">Click S/T to toggle mode</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
