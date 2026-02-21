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
import {
  REVENUE_PROMPT_KEYS,
  COMP_PROMPT_KEYS,
  LABOR_PROMPT_KEYS,
  COACHING_PROMPT_KEYS,
  GUEST_PROMPT_KEYS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

export interface CompletionState {
  revenue: 'complete' | 'incomplete';
  comps: 'complete' | 'incomplete';
  labor: 'complete' | 'incomplete';
  incidents: 'complete' | 'incomplete';
  coaching: 'complete' | 'incomplete';
  guest: 'complete' | 'incomplete';
  entertainment: 'complete' | 'incomplete';
  culinary: 'complete' | 'incomplete';
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
    if (!venueId || venueId === 'all' || !businessDate || initRef.current) return;
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
  // Revenue: all 6 structured prompts must meet min length.
  // Comps/Labor/Coaching/Guest: all structured prompts filled OR acknowledged.
  // Incidents: notes >= 10 chars OR acknowledged (uses IncidentLog, not structured prompts).
  // Tags are AI-extracted metadata — not required for completion.
  const revenueComplete = REVENUE_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const compsPromptsComplete = COMP_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const laborPromptsComplete = LABOR_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const coachingPromptsComplete = COACHING_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const guestPromptsComplete = GUEST_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const completionState: CompletionState = {
    revenue: revenueComplete ? 'complete' : 'incomplete',
    comps: (compsPromptsComplete || !!attestation?.comp_acknowledged)
      && (!triggers?.comp_resolution_required || (triggers.flagged_comps?.length || 0) <= compResolutions.length)
      ? 'complete' : 'incomplete',
    labor: (laborPromptsComplete || !!attestation?.labor_acknowledged)
      ? 'complete' : 'incomplete',
    incidents: (attestation?.incident_notes?.length ?? 0) >= 10 || !!attestation?.incidents_acknowledged
      ? 'complete' : 'incomplete',
    coaching: (coachingPromptsComplete || !!attestation?.coaching_acknowledged)
      ? 'complete' : 'incomplete',
    guest: (guestPromptsComplete || !!attestation?.guest_acknowledged)
      ? 'complete' : 'incomplete',
    entertainment: options?.entertainmentComplete ? 'complete' : 'incomplete',
    culinary: options?.culinaryComplete ? 'complete' : 'incomplete',
  };

  const canSubmit =
    attestation?.status === 'draft' &&
    !!attestation?.closing_narrative &&
    Object.values(completionState).every(v => v === 'complete');

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
