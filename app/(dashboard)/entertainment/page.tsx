/**
 * Entertainment Calendar Page
 * Shows live music, DJ, and dancer schedules
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import { AddPerformerModal } from '@/components/entertainment/AddPerformerModal';
import { ScheduleBookingModal } from '@/components/entertainment/ScheduleBookingModal';
import {
  Music,
  Users,
  Disc,
  Phone,
  DollarSign,
  Clock,
  Loader2,
  Music2,
  Plus,
  UserPlus,
  Calendar,
  Monitor,
  User,
} from 'lucide-react';

import type {
  VenueSchedule,
  ScheduleEntry,
  Artist,
  Rate,
  DayOfWeek,
  EntertainmentType,
} from '@/lib/entertainment/types';
import { DAYS_OF_WEEK, TIME_SLOTS, ENTERTAINMENT_TYPES } from '@/lib/entertainment/types';

// Map OpsOS venue names to entertainment venue IDs
const VENUE_TO_ENTERTAINMENT_MAP: Record<string, string> = {
  'The Nice Guy': 'tng',
  'Delilah': 'delilah-la',
  'Delilah LA': 'delilah-la',
  'Delilah Miami': 'delilah-mia',
  'Delilah Dallas': 'delilah-dls',
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function getEntertainmentIcon(type: EntertainmentType) {
  switch (type) {
    case 'Band':
      return <Music className="h-4 w-4" />;
    case 'Dancers':
      return <Users className="h-4 w-4" />;
    case 'DJ':
      return <Disc className="h-4 w-4" />;
    case 'AV':
      return <Monitor className="h-4 w-4" />;
  }
}

function getEntertainmentColor(type: EntertainmentType) {
  switch (type) {
    case 'Band':
      return 'bg-brass/20 text-brass-dark border-brass/30';
    case 'Dancers':
      return 'bg-sage/20 text-sage-dark border-sage/30';
    case 'DJ':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'AV':
      return 'bg-blue-100 text-blue-800 border-blue-200';
  }
}

interface Performer {
  id?: string;
  name: string;
  entertainment_type: string;
}

export default function EntertainmentPage() {
  const { selectedVenue, isAllVenues } = useVenue();
  const [schedules, setSchedules] = useState<VenueSchedule[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [addPerformerOpen, setAddPerformerOpen] = useState(false);
  const [scheduleBookingOpen, setScheduleBookingOpen] = useState(false);

  // Get entertainment venue ID from selected venue
  const venueId = selectedVenue?.name
    ? VENUE_TO_ENTERTAINMENT_MAP[selectedVenue.name]
    : null;

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/entertainment?action=all');
      if (!res.ok) {
        throw new Error('Failed to fetch schedules');
      }
      const data = await res.json();
      setSchedules(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch performers
  const fetchPerformers = useCallback(async () => {
    try {
      const url = selectedVenue?.id
        ? `/api/entertainment/performers?venue_id=${selectedVenue.id}`
        : '/api/entertainment/performers';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPerformers(data);
      }
    } catch (err) {
      console.error('Failed to fetch performers:', err);
    }
  }, [selectedVenue?.id]);

  useEffect(() => {
    fetchSchedules();
    fetchPerformers();
  }, [fetchSchedules, fetchPerformers]);

  // Refresh data when modals close successfully
  const handlePerformerSuccess = () => {
    fetchPerformers();
  };

  const handleBookingSuccess = () => {
    fetchSchedules();
  };

  // Filter schedules based on selected venue
  const filteredSchedules = isAllVenues
    ? schedules
    : schedules.filter((s) => s.venue_id === venueId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="page-header flex items-center gap-3">
            <Music2 className="h-8 w-8 text-brass" />
            Entertainment Calendar
          </h1>
          <p className="text-muted-foreground">
            Live music, DJ, and dancer schedules
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setAddPerformerOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
            Add Performer
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setScheduleBookingOpen(true)}
          >
            <Calendar className="h-4 w-4" />
            Schedule Booking
          </Button>
        </div>
      </div>

      {/* Quick Venue Switcher - Only shows for multi-venue users */}
      <VenueQuickSwitcher />

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brass" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-error">
          <CardContent className="p-6">
            <p className="text-error">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* No Venue Selected */}
      {!loading && !error && !isAllVenues && filteredSchedules.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Music2 className="h-12 w-12 mx-auto mb-4 text-brass/50" />
            <p>No entertainment schedule found for this venue.</p>
            <p className="text-sm mt-2">Select a different venue or view all venues from the dropdown above.</p>
          </CardContent>
        </Card>
      )}

      {/* Content - Show all filtered schedules */}
      {!loading && !error && filteredSchedules.length > 0 && (
        <div className="space-y-8">
          {filteredSchedules.map((schedule) => (
            <div key={schedule.venue_id} className="space-y-6">
              {/* Venue Header (only show when viewing all venues) */}
              {isAllVenues && (
                <h2 className="text-xl font-semibold text-foreground border-b border-brass/30 pb-2">
                  {schedule.venue_name}
                </h2>
              )}

              {/* Weekly Schedule Grid */}
              <Card>
                <CardHeader className="border-b border-brass/20">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-brass" />
                    Weekly Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScheduleGrid schedule={schedule} />
                </CardContent>
              </Card>

              {/* Artists & Contacts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="border-b border-brass/20 flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Phone className="h-5 w-5 text-sage" />
                      Artists & Contacts
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-sage"
                      onClick={() => setAddPerformerOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ArtistList artists={schedule.artists} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="border-b border-brass/20">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-brass" />
                      Rate Card
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <RateList rates={schedule.rates} />
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AddPerformerModal
        open={addPerformerOpen}
        onOpenChange={setAddPerformerOpen}
        venueId={selectedVenue?.id}
        venueName={selectedVenue?.name}
        onSuccess={handlePerformerSuccess}
      />

      <ScheduleBookingModal
        open={scheduleBookingOpen}
        onOpenChange={setScheduleBookingOpen}
        venueId={selectedVenue?.id}
        venueName={selectedVenue?.name}
        artists={performers}
        onSuccess={handleBookingSuccess}
      />
    </div>
  );
}

function ScheduleGrid({ schedule }: { schedule: VenueSchedule }) {
  // Group entries by type and day for calendar view
  const scheduleByTypeAndDay = ENTERTAINMENT_TYPES.reduce(
    (acc, type) => {
      acc[type] = DAYS_OF_WEEK.reduce(
        (dayAcc, day) => {
          dayAcc[day] = schedule.schedule.filter(
            (entry) => entry.entertainment_type === type && entry.day_of_week === day
          );
          return dayAcc;
        },
        {} as Record<DayOfWeek, ScheduleEntry[]>
      );
      return acc;
    },
    {} as Record<EntertainmentType, Record<DayOfWeek, ScheduleEntry[]>>
  );

  // Only show types that have at least one entry
  const activeTypes = ENTERTAINMENT_TYPES.filter((type) =>
    DAYS_OF_WEEK.some((day) => scheduleByTypeAndDay[type][day].length > 0)
  );

  // Calculate daily totals
  const dailyTotals = DAYS_OF_WEEK.reduce((acc, day) => {
    let total = 0;
    ENTERTAINMENT_TYPES.forEach((type) => {
      scheduleByTypeAndDay[type]?.[day]?.forEach((entry) => {
        if (entry.rate_amount) {
          total += entry.rate_amount;
        }
      });
    });
    acc[day] = total;
    return acc;
  }, {} as Record<DayOfWeek, number>);

  const weeklyTotal = Object.values(dailyTotals).reduce((sum, val) => sum + val, 0);

  return (
    <div className="overflow-x-auto">
      <div className="bg-card border rounded-lg min-w-[700px]">
        {/* Header Row - Days of Week */}
        <div className="grid grid-cols-8 border-b-2 border-brass bg-muted">
          <div className="p-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Type
          </div>
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className="p-3 text-center border-l border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Type Rows */}
        {activeTypes.map((type) => (
          <div
            key={type}
            className="grid grid-cols-8 border-b border-border hover:bg-muted/30 transition-colors"
          >
            {/* Type Label */}
            <div className="p-3 border-r border-border bg-muted/50">
              <div className="flex items-center gap-2">
                {getEntertainmentIcon(type)}
                <span className="text-sm font-medium">{type}</span>
              </div>
            </div>

            {/* Day Cells */}
            {DAYS_OF_WEEK.map((day) => {
              const entries = scheduleByTypeAndDay[type][day];
              return (
                <div
                  key={day}
                  className="p-2 border-l border-border min-h-[72px]"
                >
                  {entries.length > 0 ? (
                    <div className="space-y-1">
                      {entries.map((entry, idx) => (
                        <Popover key={idx}>
                          <PopoverTrigger asChild>
                            <button
                              className={`w-full text-left p-2 rounded-md border text-xs cursor-pointer hover:opacity-80 transition-opacity ${getEntertainmentColor(type)}`}
                            >
                              <div className="font-semibold">{entry.config}</div>
                              <div className="opacity-75">
                                {formatTime(entry.time_slot_start)} - {formatTime(entry.time_slot_end)}
                              </div>
                              {entry.rate_amount && (
                                <div className="font-medium mt-0.5">{formatCurrency(entry.rate_amount)}</div>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64" align="start">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 font-semibold">
                                {getEntertainmentIcon(type)}
                                <span>{type} - {entry.config}</span>
                              </div>
                              <div className="space-y-2 text-sm">
                                {entry.performer_name && (
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{entry.performer_name}</span>
                                  </div>
                                )}
                                {entry.booked_by && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <UserPlus className="h-4 w-4" />
                                    <span>Booked by {entry.booked_by}</span>
                                  </div>
                                )}
                                {entry.rate_amount && (
                                  <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{formatCurrency(entry.rate_amount)}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Clock className="h-4 w-4" />
                                  <span>{formatTime(entry.time_slot_start)} - {formatTime(entry.time_slot_end)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Calendar className="h-4 w-4" />
                                  <span>{day}</span>
                                </div>
                                {entry.notes && (
                                  <div className="pt-2 border-t text-muted-foreground">
                                    {entry.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground/40">
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Daily Totals Row */}
        {activeTypes.length > 0 && (
          <div className="grid grid-cols-8 border-b-2 border-brass bg-muted/70">
            <div className="p-3 border-r border-border">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-semibold">Daily Total</span>
              </div>
            </div>
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="p-3 text-center border-l border-border font-semibold"
              >
                {dailyTotals[day] > 0 ? formatCurrency(dailyTotals[day]) : '—'}
              </div>
            ))}
          </div>
        )}

        {/* Weekly Summary */}
        {activeTypes.length > 0 && weeklyTotal > 0 && (
          <div className="p-3 bg-brass/10 border-t border-brass/30">
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium">Weekly Entertainment Total</span>
              <span className="font-bold text-lg">{formatCurrency(weeklyTotal)}</span>
            </div>
          </div>
        )}

        {/* Empty state if no entertainment scheduled */}
        {activeTypes.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No entertainment scheduled for this venue
          </div>
        )}
      </div>
    </div>
  );
}

function ArtistList({ artists }: { artists: Artist[] }) {
  // Group by entertainment type
  const artistsByType = ENTERTAINMENT_TYPES.reduce(
    (acc, type) => {
      acc[type] = artists.filter((a) => a.entertainment_type === type);
      return acc;
    },
    {} as Record<EntertainmentType, Artist[]>
  );

  return (
    <div className="divide-y divide-border">
      {ENTERTAINMENT_TYPES.map((type) => {
        const typeArtists = artistsByType[type];
        if (typeArtists.length === 0) return null;

        return (
          <div key={type} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {getEntertainmentIcon(type)}
              <span className="font-semibold">{type}</span>
            </div>
            <div className="space-y-2 ml-6">
              {typeArtists.map((artist, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{artist.name}</span>
                    {artist.is_coordinator && (
                      <span className="ml-2 badge-brass text-xs">Coordinator</span>
                    )}
                    {artist.notes && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({artist.notes})
                      </span>
                    )}
                  </div>
                  {artist.phone && (
                    <a
                      href={`tel:${artist.phone.replace(/\s/g, '')}`}
                      className="text-sm text-brass hover:underline"
                    >
                      {artist.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RateList({ rates }: { rates: Rate[] }) {
  // Group by entertainment type
  const ratesByType = ENTERTAINMENT_TYPES.reduce(
    (acc, type) => {
      acc[type] = rates.filter((r) => r.entertainment_type === type);
      return acc;
    },
    {} as Record<EntertainmentType, Rate[]>
  );

  return (
    <div className="divide-y divide-border">
      {ENTERTAINMENT_TYPES.map((type) => {
        const typeRates = ratesByType[type];
        if (typeRates.length === 0) return null;

        return (
          <div key={type} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {getEntertainmentIcon(type)}
              <span className="font-semibold">{type}</span>
            </div>
            <div className="space-y-2 ml-6">
              {typeRates.map((rate, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{rate.description}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(rate.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
