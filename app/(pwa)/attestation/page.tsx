'use client';

/**
 * /attestation — PWA read-only view of submitted nightly attestations.
 * Lets installed-app users pull the final submission for any venue/date.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, FileX, Building2, Check } from 'lucide-react';
import { useVenue } from '@/components/providers/VenueProvider';
import { AttestationReadView } from '@/components/pwa/AttestationReadView';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Convert YYYY-MM-DD string ↔ Date for the Calendar component
  const selectedDate = new Date(date + 'T00:00:00');

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Date navigation bar */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDate((d) => shiftDate(d, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span>{formatDateShort(date)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(day) => {
                if (day) {
                  const iso = day.toLocaleDateString('en-CA'); // YYYY-MM-DD
                  setDate(iso);
                  setCalendarOpen(false);
                }
              }}
              defaultMonth={selectedDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="icon" onClick={() => setDate((d) => shiftDate(d, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Venue selector (only if multi-venue) — styled popover */}
      {venues.filter((v) => v.id !== 'all').length > 1 && (
        <VenueSelector
          venues={venues.filter((v) => v.id !== 'all')}
          selectedId={selectedVenue?.id}
          onSelect={(v) => setSelectedVenue(v)}
        />
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

// ---------------------------------------------------------------------------
// Venue Selector — styled popover (no native <select>)
// ---------------------------------------------------------------------------

type Venue = { id: string; name: string; location?: string | null; city?: string | null; state?: string | null };

function VenueSelector({
  venues,
  selectedId,
  onSelect,
}: {
  venues: Venue[];
  selectedId?: string;
  onSelect: (v: Venue) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = venues.find((v) => v.id === selectedId);

  return (
    <div className="flex items-center justify-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{current?.name ?? 'Select venue'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="center">
          <div className="flex flex-col">
            {venues.map((v) => (
              <button
                key={v.id}
                onClick={() => { onSelect(v); setOpen(false); }}
                className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                  v.id === selectedId
                    ? 'bg-brass/10 text-brass font-medium'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <span>{v.name}</span>
                {v.id === selectedId && <Check className="h-4 w-4 text-brass" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
