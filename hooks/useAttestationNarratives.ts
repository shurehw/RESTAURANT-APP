'use client';

import { useState, useCallback, useRef } from 'react';
import type { AttestationNarrativeOutput } from '@/lib/ai/attestation-narrator';

interface NarrativeInput {
  venueId: string | undefined;
  date: string;
  venueName: string;
  // Revenue
  netSales: number;
  totalCovers: number;
  foodSales: number;
  beverageSales: number;
  beveragePct: number;
  forecastNetSales: number | null;
  forecastCovers: number | null;
  vsForecastPct: number | null;
  vsSdlwPct: number | null;
  vsSdlyPct: number | null;
  // Labor
  laborCost: number;
  laborPct: number;
  splh: number;
  otHours: number;
  totalLaborHours: number;
  employeeCount: number;
  coversPerLaborHour: number | null;
  fohHours: number | null;
  fohCost: number | null;
  bohHours: number | null;
  bohCost: number | null;
  // Comps
  totalComps: number;
  compPct: number;
  compExceptionCount: number;
  compCriticalCount: number;
  compOverallAssessment: string | null;
  // Context
  healthScore: number | null;
  incidentTriggers: string[];
  // Entertainment
  hasEntertainment: boolean;
  entertainmentCost: number | null;
  entertainmentPct: number | null;
  // Culinary
  hasCulinary: boolean;
  eightysixedCount: number;
  culinaryRating: number | null;
}

interface UseAttestationNarrativesReturn {
  narratives: AttestationNarrativeOutput | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  fetchNarratives: (input: NarrativeInput) => Promise<void>;
}

export function useAttestationNarratives(): UseAttestationNarrativesReturn {
  const [narratives, setNarratives] = useState<AttestationNarrativeOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchNarratives = useCallback(async (input: NarrativeInput) => {
    if (!input.venueId || !input.date) return;

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const avgCheck = input.totalCovers > 0
        ? input.netSales / input.totalCovers
        : 0;

      const res = await fetch('/api/ai/attestation-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          venue_id: input.venueId,
          date: input.date,
          venue_name: input.venueName,
          net_sales: input.netSales,
          total_covers: input.totalCovers,
          avg_check: avgCheck,
          food_sales: input.foodSales,
          beverage_sales: input.beverageSales,
          beverage_pct: input.beveragePct,
          forecast_net_sales: input.forecastNetSales,
          forecast_covers: input.forecastCovers,
          vs_forecast_pct: input.vsForecastPct,
          vs_sdlw_pct: input.vsSdlwPct,
          vs_sdly_pct: input.vsSdlyPct,
          labor_cost: input.laborCost,
          labor_pct: input.laborPct,
          splh: input.splh,
          ot_hours: input.otHours,
          total_labor_hours: input.totalLaborHours,
          employee_count: input.employeeCount,
          covers_per_labor_hour: input.coversPerLaborHour,
          foh_hours: input.fohHours,
          foh_cost: input.fohCost,
          boh_hours: input.bohHours,
          boh_cost: input.bohCost,
          total_comps: input.totalComps,
          comp_pct: input.compPct,
          comp_exception_count: input.compExceptionCount,
          comp_critical_count: input.compCriticalCount,
          comp_overall_assessment: input.compOverallAssessment,
          health_score: input.healthScore,
          incident_triggers: input.incidentTriggers,
          has_entertainment: input.hasEntertainment,
          entertainment_cost: input.entertainmentCost,
          entertainment_pct: input.entertainmentPct,
          has_culinary: input.hasCulinary,
          eightysixed_count: input.eightysixedCount,
          culinary_rating: input.culinaryRating,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to generate narratives (${res.status})`);
      }

      const data = await res.json();
      if (data.success && data.data) {
        setNarratives(data.data);
        setCached(!!data.cached);
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to generate AI narratives');
    } finally {
      setLoading(false);
    }
  }, []);

  return { narratives, loading, error, cached, fetchNarratives };
}
