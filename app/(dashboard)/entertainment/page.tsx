/**
 * Entertainment Calendar Page
 * Shows live music, DJ, and dancer schedules
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
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
  }
}

export default function EntertainmentPage() {
  const { selectedVenue, isAllVenues } = useVenue();
  const [schedules, setSchedules] = useState<VenueSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get entertainment venue ID from selected venue
  const venueId = selectedVenue?.name
    ? VENUE_TO_ENTERTAINMENT_MAP[selectedVenue.name]
    : null;

  // Fetch schedules
  useEffect(() => {
    async function fetchSchedules() {
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
    }
    fetchSchedules();
  }, []);

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
          <Button variant="outline" size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Performer
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
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
                    <Button variant="ghost" size="sm" className="gap-1 text-sage">
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
    </div>
  );
}

function ScheduleGrid({ schedule }: { schedule: VenueSchedule }) {
  // Group entries by day and type
  const scheduleByDay = DAYS_OF_WEEK.reduce(
    (acc, day) => {
      acc[day] = ENTERTAINMENT_TYPES.reduce(
        (typeAcc, type) => {
          typeAcc[type] = schedule.schedule.filter(
            (entry) => entry.day_of_week === day && entry.entertainment_type === type
          );
          return typeAcc;
        },
        {} as Record<EntertainmentType, ScheduleEntry[]>
      );
      return acc;
    },
    {} as Record<DayOfWeek, Record<EntertainmentType, ScheduleEntry[]>>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-brass bg-muted">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20">
              Day
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-24">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Schedule
            </th>
          </tr>
        </thead>
        <tbody>
          {DAYS_OF_WEEK.map((day) => {
            const daySchedule = scheduleByDay[day];
            const hasAnyEntries = ENTERTAINMENT_TYPES.some(
              (type) => daySchedule[type].length > 0
            );

            if (!hasAnyEntries) return null;

            return ENTERTAINMENT_TYPES.map((type, typeIdx) => {
              const entries = daySchedule[type];
              if (entries.length === 0) return null;

              return (
                <tr
                  key={`${day}-${type}`}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  {typeIdx === 0 ? (
                    <td
                      rowSpan={ENTERTAINMENT_TYPES.filter((t) => daySchedule[t].length > 0).length}
                      className="px-4 py-3 font-semibold text-foreground align-top border-r border-border"
                    >
                      {day}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getEntertainmentIcon(type)}
                      <span className="text-sm font-medium">{type}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {entries.map((entry, idx) => (
                        <div
                          key={idx}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm ${getEntertainmentColor(type)}`}
                        >
                          <span className="font-medium">{entry.config}</span>
                          <span className="text-xs opacity-75">
                            {formatTime(entry.time_slot_start)} - {formatTime(entry.time_slot_end)}
                          </span>
                          {entry.notes && (
                            <span className="text-xs opacity-60">({entry.notes})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
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
