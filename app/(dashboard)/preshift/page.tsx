/**
 * Preshift Briefing Page
 *
 * Full preshift document: auto-populated Keva data + manager-editable sections.
 * Printable for FOH staff. Manager notes auto-save on edit.
 * Past dates are read-only. Navigate with date picker.
 *
 * The rules are always on. The rails are fixed.
 * Calibration is allowed. Escape is not.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import {
  ListOrdered,
  Megaphone,
  Star,
  Newspaper,
  Brush,
} from 'lucide-react';

import { useVenue } from '@/components/providers/VenueProvider';
import { PreshiftHeader } from '@/components/preshift/PreshiftHeader';
import { PreshiftEditableSection } from '@/components/preshift/PreshiftEditableSection';
import { StaffingSection } from '@/components/preshift/StaffingSection';
import { EightySixSection } from '@/components/preshift/EightySixSection';
import type { EightySixedItem } from '@/components/preshift/EightySixSection';
import { ReviewsSection } from '@/components/preshift/ReviewsSection';
import { VipTable } from '@/components/preshift/VipTable';
import { EventsSection } from '@/components/preshift/EventsSection';
import { EnforcementSection } from '@/components/preshift/EnforcementSection';
import { DemandBanner } from '@/components/preshift/DemandBanner';

// ── Types ──────────────────────────────────────────────────────

interface PreshiftFullData {
  success: boolean;
  business_date: string;
  notes: {
    id: string;
    flow_of_service: string | null;
    announcements: string | null;
    service_notes: string | null;
    food_notes: string | null;
    beverage_notes: string | null;
    company_news: string | null;
    zone_cleaning: string | null;
    eightysixed: EightySixedItem[];
  } | null;
  covers_forecast: number | null;
  staffing: Array<{
    position: string;
    count: number;
    names: string[];
  }>;
  vip_reservations: Array<{
    time: string;
    party_size: number;
    name: string;
    notes: string | null;
    client_requests: string | null;
    min_spend: number | null;
    tags: unknown[];
  }>;
  large_parties: Array<{
    time: string;
    party_size: number;
    name: string;
    notes: string | null;
    min_spend: number | null;
  }>;
  recent_reviews: {
    reviews: Array<{ source: string; rating: number; snippet: string; date: string }>;
    avg_rating: number | null;
    count_last_7d: number;
  };
  eighty_sixed_items: string[];
  entertainment: Array<{
    entertainment_type: string;
    config: string | null;
    artist_name: string | null;
    time_start: string | null;
    time_end: string | null;
    status: string;
    notes: string | null;
  }>;
  tripleseat_events: Array<{
    event_name: string;
    event_type: string | null;
    start_time: string | null;
    end_time: string | null;
    guest_count: number | null;
    room_name: string | null;
    is_buyout: boolean;
    status: string;
  }>;
  demand_calendar: {
    narrative: string | null;
    is_holiday: boolean;
    holiday_name: string | null;
    has_private_event: boolean;
    private_event_type: string | null;
    demand_multiplier: number;
  } | null;
  enforcement_summary: {
    items: Array<{
      source_table: string;
      source_id: string;
      severity: string;
      title: string;
      description: string;
      age_hours?: number;
      actions?: string[];
    }>;
    counts: {
      critical?: number;
      warning?: number;
      info?: number;
      total?: number;
    };
  } | null;
}

// ── Helpers ────────────────────────────────────────────────────

function getTodayBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}

// ── Component ──────────────────────────────────────────────────

export default function PreshiftPage() {
  const { selectedVenue } = useVenue();
  const [data, setData] = useState<PreshiftFullData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayBusinessDate);

  const todayDate = getTodayBusinessDate();
  const isToday = date === todayDate;
  const readonly = !isToday;

  // ── Editable note fields (local state) ──
  const [flowOfService, setFlowOfService] = useState('');
  const [announcements, setAnnouncements] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [foodNotes, setFoodNotes] = useState('');
  const [beverageNotes, setBeverageNotes] = useState('');
  const [companyNews, setCompanyNews] = useState('');
  const [zoneCleaning, setZoneCleaning] = useState('');
  const [eightysixed, setEightysixed] = useState<EightySixedItem[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // ── Fetch all preshift data ──
  const fetchData = useCallback(async () => {
    if (!selectedVenue?.id || selectedVenue.id === 'all') return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/preshift/full?venue_id=${selectedVenue.id}&date=${date}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Failed to fetch preshift data');

      const json: PreshiftFullData = await res.json();
      setData(json);

      // Populate editable fields from server
      const n = json.notes;
      setFlowOfService(n?.flow_of_service || '');
      setAnnouncements(n?.announcements || '');
      setServiceNotes(n?.service_notes || '');
      setFoodNotes(n?.food_notes || '');
      setBeverageNotes(n?.beverage_notes || '');
      setCompanyNews(n?.company_news || '');
      setZoneCleaning(n?.zone_cleaning || '');
      setEightysixed(n?.eightysixed || []);
      initialLoadRef.current = false;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVenue?.id, date]);

  useEffect(() => {
    initialLoadRef.current = true;
    fetchData();
  }, [fetchData]);

  // ── Auto-save debounced (only for today) ──
  const saveNotes = useCallback(async () => {
    if (!selectedVenue?.id || selectedVenue.id === 'all') return;
    if (readonly) return;

    setSaveStatus('saving');
    try {
      await fetch('/api/preshift/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          venue_id: selectedVenue.id,
          business_date: date,
          flow_of_service: flowOfService,
          announcements,
          service_notes: serviceNotes,
          food_notes: foodNotes,
          beverage_notes: beverageNotes,
          company_news: companyNews,
          zone_cleaning: zoneCleaning,
          eightysixed,
        }),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, [
    selectedVenue?.id, date, readonly,
    flowOfService, announcements, serviceNotes,
    foodNotes, beverageNotes, companyNews, zoneCleaning, eightysixed,
  ]);

  useEffect(() => {
    if (initialLoadRef.current || readonly) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveNotes, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [saveNotes, readonly]);

  // ── Enforcement action handler ──
  async function handleEnforcementAction(sourceTable: string, sourceId: string, action: string) {
    await fetch('/api/preshift/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ source_table: sourceTable, source_id: sourceId, action }),
    });
    await fetchData();
  }

  // ── Date navigation ──
  function handleDateChange(newDate: string) {
    setDate(newDate);
    setData(null);
  }

  // ── Render ──────────────────────────────────────────────────

  if (selectedVenue?.id === 'all') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Select a venue to view the preshift briefing</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading preshift briefing...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-error/50 bg-error/5">
          <CardContent className="p-6">
            <p className="text-error">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="container mx-auto px-4 py-6 print:px-0 print:py-2 max-w-4xl space-y-6 print:space-y-4">
        {/* Header — Venue, Date nav, Covers, Print */}
        <PreshiftHeader
          venueName={selectedVenue?.name || 'Venue'}
          date={data.business_date}
          coversForecast={data.covers_forecast}
          onPrint={() => window.print()}
          onRefresh={fetchData}
          onDateChange={handleDateChange}
          isToday={isToday}
          readonly={readonly}
        />

        {/* Save indicator */}
        {!readonly && saveStatus !== 'idle' && (
          <div className="text-xs text-muted-foreground text-right print:hidden">
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </div>
        )}

        {/* Demand Context Banner */}
        {data.demand_calendar && (
          <DemandBanner demand={data.demand_calendar} />
        )}

        {/* Flow of Service */}
        <PreshiftEditableSection
          title="Flow of Service"
          icon={<ListOrdered className="h-4 w-4 text-brass" />}
          value={flowOfService}
          onChange={setFlowOfService}
          placeholder="Describe tonight's flow of service..."
          readonly={readonly}
        />

        {/* Announcements */}
        <PreshiftEditableSection
          title="Announcements"
          icon={<Megaphone className="h-4 w-4 text-brass" />}
          value={announcements}
          onChange={setAnnouncements}
          placeholder="Team announcements, schedule changes, reminders..."
          readonly={readonly}
        />

        {/* Service Notes */}
        <PreshiftEditableSection
          title="Service Notes"
          icon={<Star className="h-4 w-4 text-brass" />}
          value={serviceNotes}
          onChange={setServiceNotes}
          placeholder="Value of the week, service focus, standards reminders..."
          readonly={readonly}
        />

        {/* Staffing — auto from schedule */}
        <StaffingSection staffing={data.staffing || []} />

        {/* Zone Cleaning */}
        <PreshiftEditableSection
          title="Zone Cleaning"
          icon={<Brush className="h-4 w-4 text-brass" />}
          value={zoneCleaning}
          onChange={setZoneCleaning}
          placeholder="Zone assignments, deep clean areas..."
          readonly={readonly}
        />

        {/* Food & Beverage — 86'd items + notes */}
        <EightySixSection
          items={eightysixed}
          onItemsChange={setEightysixed}
          previousNightItems={data.eighty_sixed_items}
          foodNotes={foodNotes}
          beverageNotes={beverageNotes}
          onFoodNotesChange={setFoodNotes}
          onBeverageNotesChange={setBeverageNotes}
          readonly={readonly}
        />

        {/* Company News */}
        <PreshiftEditableSection
          title="Company News"
          icon={<Newspaper className="h-4 w-4 text-brass" />}
          value={companyNews}
          onChange={setCompanyNews}
          placeholder="Company updates, brand news, recognition..."
          readonly={readonly}
        />

        {/* Reviews — auto */}
        <ReviewsSection
          reviews={data.recent_reviews.reviews}
          avgRating={data.recent_reviews.avg_rating}
          count={data.recent_reviews.count_last_7d}
        />

        {/* VIPs — auto */}
        <VipTable vips={data.vip_reservations} />

        {/* Events & Large Parties — auto */}
        <EventsSection
          largeParties={data.large_parties}
          events={data.tripleseat_events?.length > 0
            ? data.tripleseat_events.map(e => ({
                name: e.event_name,
                type: e.event_type,
                guest_count: e.guest_count,
                room: e.room_name,
                is_buyout: e.is_buyout,
                start_time: e.start_time,
              }))
            : (data.demand_calendar?.has_private_event ? data.demand_calendar.private_event_type : null)
          }
          entertainment={data.entertainment?.length > 0
            ? data.entertainment.map(e => ({
                name: e.artist_name || e.config || e.entertainment_type,
                time: e.time_start ? `${e.time_start}${e.time_end ? '–' + e.time_end : ''}` : null,
                type: e.entertainment_type,
                config: e.config,
              }))
            : null
          }
        />

        {/* Enforcement — collapsible, auto */}
        {data.enforcement_summary && (
          <EnforcementSection
            items={data.enforcement_summary.items}
            counts={data.enforcement_summary.counts}
            onAction={handleEnforcementAction}
          />
        )}
      </div>
    </div>
  );
}
