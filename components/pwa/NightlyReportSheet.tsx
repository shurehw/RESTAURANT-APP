'use client';

/**
 * NightlyReportSheet — slide-up drawer showing the submitted nightly attestation.
 * Fetches the most recent submitted report for the selected venue + business date.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  FileX,
} from 'lucide-react';
import { useVenue } from '@/components/providers/VenueProvider';
import { AttestationReadView } from '@/components/pwa/AttestationReadView';
import type {
  NightlyAttestation,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Types
// ---------------------------------------------------------------------------

interface AttestationData {
  attestation: NightlyAttestation;
  comp_resolutions: CompResolution[];
  incidents: NightlyIncident[];
  coaching_actions: CoachingAction[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NightlyReportSheet() {
  const { selectedVenue } = useVenue();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(getDefaultDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AttestationData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const venueId = selectedVenue?.id && selectedVenue.id !== 'all' ? selectedVenue.id : null;
  const venueName = selectedVenue?.name ?? 'Venue';

  const fetchAttestation = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setData(null);
    setNotFound(false);

    try {
      const listRes = await fetch(
        `/api/attestation?venue_id=${venueId}&business_date=${date}`,
        { credentials: 'include' },
      );
      if (!listRes.ok) throw new Error('Failed to fetch');
      const listJson = await listRes.json();
      const rows: NightlyAttestation[] = listJson.data || [];

      const submitted = rows.find((r) => r.status === 'submitted' || r.status === 'amended');
      if (!submitted?.id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

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

  // Fetch when sheet opens or date/venue changes (only if open)
  useEffect(() => {
    if (open) fetchAttestation();
  }, [open, fetchAttestation]);

  // Reset date when sheet opens
  useEffect(() => {
    if (open) setDate(getDefaultDate());
  }, [open]);

  const selectedDate = new Date(date + 'T00:00:00');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          aria-label="View nightly report"
        >
          <ClipboardCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Report</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Nightly Report</SheetTitle>
        </SheetHeader>

        {/* Date navigation */}
        <div className="flex items-center justify-between gap-2 mb-4">
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
                    const iso = day.toLocaleDateString('en-CA');
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

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not found */}
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

        {/* No venue */}
        {!venueId && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
            <div className="text-sm text-muted-foreground">Select a venue to view reports</div>
          </div>
        )}

        {/* Report content */}
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
      </SheetContent>
    </Sheet>
  );
}
