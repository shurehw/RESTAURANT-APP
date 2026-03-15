'use client';

/**
 * /attestation — PWA read-only view of submitted nightly attestations.
 * Lets installed-app users pull the final submission for any venue/date.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, FileX } from 'lucide-react';
import { useVenue } from '@/components/providers/VenueProvider';
import { AttestationReadView } from '@/components/pwa/AttestationReadView';
import { Button } from '@/components/ui/button';
import type {
  NightlyAttestation,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Business-date-aware "yesterday": before 5 AM PT → two days back, else one day back. */
function getDefaultDate(): string {
  const now = new Date();
  const ptString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const ptDate = new Date(ptString);
  const hour = ptDate.getHours();
  const d = new Date(ptDate.toISOString().split('T')[0] + 'T12:00:00');
  d.setDate(d.getDate() - (hour < 5 ? 2 : 1));
  return d.toISOString().split('T')[0];
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface AttestationData {
  attestation: NightlyAttestation;
  comp_resolutions: CompResolution[];
  incidents: NightlyIncident[];
  coaching_actions: CoachingAction[];
}

export default function PwaAttestationPage() {
  const { selectedVenue, venues, setSelectedVenue, isHydrated } = useVenue();
  const [date, setDate] = useState(getDefaultDate);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AttestationData | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Auto-select first venue if none selected
  useEffect(() => {
    if (isHydrated && !selectedVenue && venues.length > 0) {
      // Skip "all" venue option
      const first = venues.find((v) => v.id !== 'all') ?? venues[0];
      setSelectedVenue(first);
    }
  }, [isHydrated, selectedVenue, venues, setSelectedVenue]);

  const venueId = selectedVenue?.id && selectedVenue.id !== 'all' ? selectedVenue.id : null;

  const fetchAttestation = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setData(null);
    setNotFound(false);

    try {
      // Step 1: Find attestation for this venue + date
      const listRes = await fetch(
        `/api/attestation?venue_id=${venueId}&business_date=${date}`,
        { credentials: 'include' },
      );
      if (!listRes.ok) throw new Error('Failed to fetch');
      const listJson = await listRes.json();
      const rows: NightlyAttestation[] = listJson.data || [];

      // Find submitted or amended attestation
      const submitted = rows.find((r) => r.status === 'submitted' || r.status === 'amended');
      if (!submitted?.id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Step 2: Fetch full attestation with children
      const detailRes = await fetch(
        `/api/attestation/${submitted.id}`,
        { credentials: 'include' },
      );
      if (!detailRes.ok) throw new Error('Failed to fetch detail');
      const detailJson = await detailRes.json();

      setData({
        attestation: detailJson.data.attestation,
        comp_resolutions: detailJson.data.comp_resolutions || [],
        incidents: detailJson.data.incidents || [],
        coaching_actions: detailJson.data.coaching_actions || [],
      });
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [venueId, date]);

  useEffect(() => {
    fetchAttestation();
  }, [fetchAttestation]);

  const venueName = selectedVenue?.name ?? 'Select Venue';

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Date navigation bar */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDate((d) => shiftDate(d, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent border-none text-sm font-medium text-center focus:outline-none"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={() => setDate((d) => shiftDate(d, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Venue selector (only if multi-venue) */}
      {venues.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {venues
            .filter((v) => v.id !== 'all')
            .map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedVenue(v)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  v.id === selectedVenue?.id
                    ? 'bg-brass text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {v.name}
              </button>
            ))}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {notFound && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <FileX className="h-10 w-10 text-muted-foreground/50" />
          <div className="space-y-1">
            <div className="text-sm font-medium">No attestation submitted</div>
            <div className="text-xs text-muted-foreground">
              {venueName} &mdash; {formatDateShort(date)}
            </div>
          </div>
        </div>
      )}

      {data && !loading && (
        <AttestationReadView
          attestation={data.attestation}
          compResolutions={data.comp_resolutions}
          incidents={data.incidents}
          coachingActions={data.coaching_actions}
          venueName={venueName}
          date={date}
        />
      )}
    </div>
  );
}
