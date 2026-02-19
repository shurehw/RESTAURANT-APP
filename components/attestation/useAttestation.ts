'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { computeTriggers } from '@/lib/attestation/triggers';
import type {
  NightlyAttestation,
  NightlyReportPayload,
  TriggerResult,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';

export interface CompletionState {
  revenue: 'complete' | 'incomplete' | 'not_required';
  comps: 'complete' | 'incomplete' | 'not_required';
  labor: 'complete' | 'incomplete' | 'not_required';
  incidents: 'complete' | 'incomplete' | 'not_required';
  coaching: 'always_optional';
  entertainment: 'complete' | 'incomplete' | 'not_required';
  culinary: 'complete' | 'incomplete' | 'not_required';
}

/** Extract error message from API JSON response { error: '...' } */
async function extractError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error || `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

export function useAttestation(
  venueId: string | undefined,
  businessDate: string | undefined,
  reportData: NightlyReportPayload | null,
  options?: {
    entertainmentRequired?: boolean;
    entertainmentComplete?: boolean;
    culinaryRequired?: boolean;
    culinaryComplete?: boolean;
  },
) {
  const [attestation, setAttestation] = useState<NightlyAttestation | null>(null);
  const [triggers, setTriggers] = useState<TriggerResult | null>(null);
  const [compResolutions, setCompResolutions] = useState<CompResolution[]>([]);
  const [incidents, setIncidents] = useState<NightlyIncident[]>([]);
  const [coachingActions, setCoachingActions] = useState<CoachingAction[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initRef = useRef(false);

  // -----------------------------------------------------------------------
  // Compute triggers when report data changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!reportData) {
      setTriggers(null);
      return;
    }
    const result = computeTriggers(reportData);
    setTriggers(result);
  }, [reportData]);

  // -----------------------------------------------------------------------
  // Init: create or fetch attestation draft
  // -----------------------------------------------------------------------
  const initAttestation = useCallback(async () => {
    if (!venueId || !businessDate || initRef.current) return;
    initRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Try to create (returns existing if already exists)
      const createRes = await fetch('/api/attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ venue_id: venueId, business_date: businessDate }),
      });

      if (!createRes.ok) {
        throw new Error(await extractError(createRes, 'Failed to create attestation'));
      }

      const { data: created } = await createRes.json();
      const attestationId = created.id;

      // Fetch full attestation with children
      const detailRes = await fetch(`/api/attestation/${attestationId}`, {
        credentials: 'include',
      });

      if (!detailRes.ok) {
        throw new Error(await extractError(detailRes, 'Failed to fetch attestation'));
      }

      const { data } = await detailRes.json();
      setAttestation(data.attestation);
      setCompResolutions(data.comp_resolutions || []);
      setIncidents(data.incidents || []);
      setCoachingActions(data.coaching_actions || []);
    } catch (err: any) {
      console.error('[useAttestation] Init failed:', err.message || err);
      setError(err.message || 'Failed to initialize attestation');
    } finally {
      setLoading(false);
    }
  }, [venueId, businessDate]);

  useEffect(() => {
    initAttestation();
  }, [initAttestation]);

  // Reset when venue/date changes
  useEffect(() => {
    initRef.current = false;
    setAttestation(null);
    setCompResolutions([]);
    setIncidents([]);
    setCoachingActions([]);
    setError(null);
  }, [venueId, businessDate]);

  // -----------------------------------------------------------------------
  // Update attestation fields (auto-save)
  // -----------------------------------------------------------------------
  const updateField = useCallback(
    async (fields: Partial<NightlyAttestation>) => {
      if (!attestation?.id) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/attestation/${attestation.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(fields),
        });

        if (!res.ok) {
          throw new Error(await extractError(res, 'Failed to save'));
        }

        const { data } = await res.json();
        setAttestation(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [attestation?.id],
  );

  // -----------------------------------------------------------------------
  // Add comp resolution
  // -----------------------------------------------------------------------
  const addCompResolution = useCallback(
    async (resolution: Omit<CompResolution, 'id' | 'attestation_id' | 'venue_id' | 'business_date' | 'created_at' | 'updated_at'>) => {
      if (!attestation?.id) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/attestation/${attestation.id}/comp-resolutions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(resolution),
        });

        if (!res.ok) {
          throw new Error(await extractError(res, 'Failed to save comp resolution'));
        }

        const { data } = await res.json();
        setCompResolutions((prev) => [...prev, data]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [attestation?.id],
  );

  // -----------------------------------------------------------------------
  // Add incident
  // -----------------------------------------------------------------------
  const addIncident = useCallback(
    async (incident: Omit<NightlyIncident, 'id' | 'attestation_id' | 'venue_id' | 'business_date' | 'created_at' | 'updated_at'>) => {
      if (!attestation?.id) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/attestation/${attestation.id}/incidents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(incident),
        });

        if (!res.ok) {
          throw new Error(await extractError(res, 'Failed to save incident'));
        }

        const { data } = await res.json();
        setIncidents((prev) => [...prev, data]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [attestation?.id],
  );

  // -----------------------------------------------------------------------
  // Add coaching action
  // -----------------------------------------------------------------------
  const addCoaching = useCallback(
    async (coaching: Omit<CoachingAction, 'id' | 'attestation_id' | 'venue_id' | 'business_date' | 'created_at' | 'updated_at'>) => {
      if (!attestation?.id) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/attestation/${attestation.id}/coaching`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(coaching),
        });

        if (!res.ok) {
          throw new Error(await extractError(res, 'Failed to save coaching action'));
        }

        const { data } = await res.json();
        setCoachingActions((prev) => [...prev, data]);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    },
    [attestation?.id],
  );

  // -----------------------------------------------------------------------
  // Submit attestation
  // -----------------------------------------------------------------------
  const submitAttestation = useCallback(
    async (amendmentReason?: string) => {
      if (!attestation?.id) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/attestation/${attestation.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ amendment_reason: amendmentReason }),
        });

        if (!res.ok) {
          throw new Error(await extractError(res, 'Failed to submit attestation'));
        }

        const { data, actions_created } = await res.json();
        setAttestation(data);
        return { success: true, actionsCreated: actions_created };
      } catch (err: any) {
        setError(err.message);
        return { success: false };
      } finally {
        setSubmitting(false);
      }
    },
    [attestation?.id],
  );

  // -----------------------------------------------------------------------
  // Completion state
  // -----------------------------------------------------------------------
  const completionState: CompletionState = {
    revenue: !triggers?.revenue_attestation_required
      ? 'not_required'
      : (attestation?.revenue_tags?.length ?? 0) > 0
        ? 'complete'
        : 'incomplete',
    comps: !triggers?.comp_resolution_required
      ? 'not_required'
      : (triggers.flagged_comps?.length || 0) <= compResolutions.length
        ? 'complete'
        : 'incomplete',
    labor: !triggers?.labor_attestation_required
      ? 'not_required'
      : (attestation?.labor_tags?.length ?? 0) > 0
        ? 'complete'
        : 'incomplete',
    incidents: !triggers?.incident_log_required
      ? 'not_required'
      : incidents.length > 0
        ? 'complete'
        : 'incomplete',
    coaching: 'always_optional',
    entertainment: !options?.entertainmentRequired
      ? 'not_required'
      : options?.entertainmentComplete
        ? 'complete'
        : 'incomplete',
    culinary: !options?.culinaryRequired
      ? 'not_required'
      : options?.culinaryComplete
        ? 'complete'
        : 'incomplete',
  };

  const canSubmit =
    attestation?.status === 'draft' &&
    completionState.revenue !== 'incomplete' &&
    completionState.comps !== 'incomplete' &&
    completionState.labor !== 'incomplete' &&
    completionState.incidents !== 'incomplete' &&
    completionState.entertainment !== 'incomplete' &&
    completionState.culinary !== 'incomplete';

  const isLocked = attestation?.status === 'submitted' || attestation?.status === 'amended';

  return {
    attestation,
    triggers,
    compResolutions,
    incidents,
    coachingActions,
    loading,
    saving,
    submitting,
    error,
    completionState,
    canSubmit,
    isLocked,
    updateField,
    addCompResolution,
    addIncident,
    addCoaching,
    submitAttestation,
  };
}
