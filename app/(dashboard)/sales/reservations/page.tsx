'use client';

import { useState, useEffect, useMemo } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Users,
  Star,
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  Loader2,
  Clock,
  BarChart3,
  TrendingDown,
  XCircle,
  UserX,
  Footprints,
  Eye,
  Plus,
  Gauge,
  ShieldAlert,
} from 'lucide-react';
import { PacingControlPanel } from '@/components/reservations/PacingControlPanel';
import { RecommendationBanner } from '@/components/reservations/RecommendationBanner';
import { DemandCalendarCard } from '@/components/reservations/DemandCalendarCard';

// ─── Types ──────────────────────────────────────────────────────────

interface Reservation {
  id: string;
  first_name: string;
  last_name: string;
  party_size: number;
  arrival_time: string | null;
  seated_time: string | null;
  left_time: string | null;
  status: string;
  booked_by: string | null;
  is_vip: boolean;
  tags: string[] | null;
  min_price: number | null;
  reservation_type: string | null;
  venue_seating_area_name: string | null;
  notes: string | null;
  client_requests: string | null;
  table_number: string | null;
}

type SortField = 'time' | 'name';

interface TableTypeStats {
  type: string;
  tableCount: number;
  avgTurns: number;
  avgTurnMinutes: number;
  avgRevenue: number;
  utilizationPct: number;
}

interface ReservationStats {
  serviceWindow: { start: string; end: string; durationMinutes: number };
  overall: {
    avgTurnMinutes: number;
    totalTurns: number;
    occupiedSeatHours: number;
    availableSeatHours: number;
    utilizationPct: number;
    deadSeatHours: number;
    gapHours: number;
    revenuePerCoverHour: number;
  };
  tableTypes: TableTypeStats[];
  demandSignals: { cancellations: number; noShows: number; walkIns: number };
  lostRevenue: { fromGaps: number; fromDeadSeats: number; demandConstrained: number };
  posValidated: { parties: number; covers: number };
}

// ─── Outlook Types ──────────────────────────────────────────────────

type SlotStatus = 'open' | 'tight' | 'full' | 'overbooked';

interface OutlookSlot {
  label: string;
  startHour: number;
  tablesBooked: number;
  tablesAvailable: number;
  coversBooked: number;
  seatsAvailable: number;
  unassignedCovers: number;
  pacingLimit: number | null;
  pacingHeadroom: number | null;
  status: SlotStatus;
}

interface OverbookSuggestion {
  slotLabel: string;
  currentCovers: number;
  pacingLimit: number | null;
  expectedNoShows: number;
  effectiveCovers: number;
  suggestedExtra: number;
  reason: string;
}

interface TableTypeSummary {
  type: string;
  totalTables: number;
  bookedTables: number;
  avgProjectedTurn: number;
}

interface AccessRuleSlotInfo {
  time: string;
  coversRemaining: number | null;
}

interface AccessRuleInfo {
  ruleId: string;
  description: string;
  pacingLimit: number | null;
  seatingAreaId: string | null;
  isExclusive: boolean;
  serviceCharge: number;
  gratuity: number;
  minSpend: number | null;
  slots: AccessRuleSlotInfo[];
}

interface AccessRuleShiftInfo {
  shiftName: string;
  accessRules: AccessRuleInfo[];
  requestOnlySlots: string[];
}

interface OutlookData {
  date: string;
  shiftDataSource: 'sevenrooms' | 'historical';
  summary: {
    totalReservations: number;
    totalCovers: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    totalTables: number;
    totalSeats: number;
    peakUtilizationPct: number;
    historicalNoShowRate: number;
    shiftName: string | null;
    coversPerInterval: number | null;
    intervalMinutes: number | null;
  };
  slots: OutlookSlot[];
  overbookSuggestions: OverbookSuggestion[];
  byTableType: TableTypeSummary[];
  accessRules: AccessRuleShiftInfo[] | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fmtTime = (time: string | null) => {
  if (!time) return '—';
  if (time.match(/^\d{2}:\d{2}/)) {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  try {
    return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const STATUS_COLORS: Record<string, string> = {
  SEATED: 'border-emerald-500 text-emerald-500',
  ARRIVED: 'border-blue-500 text-blue-500',
  CONFIRMED: 'border-amber-500 text-amber-500',
  PENDING: 'border-muted-foreground text-muted-foreground',
  COMPLETE: 'border-muted-foreground/50 text-muted-foreground/50',
  CANCELLED: 'border-red-500 text-red-500',
  CANCELED: 'border-red-500 text-red-500',
  PAID: 'border-violet-500 text-violet-500',
  NO_SHOW: 'border-red-400 text-red-400',
};

const STATUS_ORDER: Record<string, number> = {
  SEATED: 1, ARRIVED: 2, CONFIRMED: 3, PENDING: 4, PAID: 5, COMPLETE: 6, CANCELLED: 7, CANCELED: 7, NO_SHOW: 8,
};

// ─── Page Component ─────────────────────────────────────────────────

export default function ReservationsPage() {
  const { selectedVenue, isAllVenues, isHydrated } = useVenue();

  // Data
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controls
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [bookedByFilter, setBookedByFilter] = useState('');
  const [vipOnly, setVipOnly] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<ReservationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Outlook (today + future dates — today before/during service)
  const [outlook, setOutlook] = useState<OutlookData | null>(null);
  const [outlookLoading, setOutlookLoading] = useState(false);
  // Gate on isHydrated so SSR always renders the past-view path,
  // preventing server/client hydration mismatch from timezone drift.
  const isFutureDate = isHydrated && selectedDate >= todayISO();

  // ─── Data fetching ───────────────────────────────────────────────

  useEffect(() => {
    if (!isHydrated || !selectedVenue || isAllVenues) return;
    setLoading(true);
    setError(null);
    setExpandedRowId(null);

    fetch(`/api/sales/reservations?venue_id=${selectedVenue.id}&date=${selectedDate}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Server error (${res.status})`);
        return data;
      })
      .then(data => {
        setReservations(data.reservations || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isHydrated, selectedVenue, isAllVenues, selectedDate]);

  // Stats fetch (past/today only)
  useEffect(() => {
    if (!isHydrated || !selectedVenue || isAllVenues || isFutureDate) return;
    setStatsLoading(true);
    setStats(null);

    fetch(`/api/sales/reservations/stats?venue_id=${selectedVenue.id}&date=${selectedDate}`)
      .then(async res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [isHydrated, selectedVenue, isAllVenues, selectedDate, isFutureDate]);

  // Outlook fetch (future dates only)
  useEffect(() => {
    if (!isHydrated || !selectedVenue || isAllVenues || !isFutureDate) return;
    setOutlookLoading(true);
    setOutlook(null);

    fetch(`/api/sales/reservations/outlook?venue_id=${selectedVenue.id}&date=${selectedDate}`)
      .then(async res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => setOutlook(data))
      .catch(() => setOutlook(null))
      .finally(() => setOutlookLoading(false));
  }, [isHydrated, selectedVenue, isAllVenues, selectedDate, isFutureDate]);

  // ─── Filtering & sorting ────────────────────────────────────────

  const filteredResos = useMemo(() => {
    let list = reservations;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        (r.booked_by || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        (r.table_number || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter(r => r.status === statusFilter);
    if (bookedByFilter) list = list.filter(r => r.booked_by === bookedByFilter);
    if (vipOnly) list = list.filter(r => r.is_vip);
    return [...list].sort((a, b) => {
      if (sortField === 'name') return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      return (a.arrival_time || '99:99').localeCompare(b.arrival_time || '99:99');
    });
  }, [reservations, search, statusFilter, bookedByFilter, vipOnly, sortField]);

  // ─── Aggregates ──────────────────────────────────────────────────

  // Count reservations that were on the book (exclude cancellations and
  // no-shows only). CONFIRMED is included because our data pipeline often
  // captures a stale snapshot — 7rooms updates status to Left/Seated/etc.
  // in real time but full_reservations retains CONFIRMED for guests who
  // actually showed up.
  const EXCLUDED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'NO_SHOW', 'LEFT_MESSAGE']);
  const resoTotals = useMemo(() => {
    const onBook = filteredResos.filter(r => !EXCLUDED_STATUSES.has(r.status));
    return {
      count: onBook.length,
      covers: onBook.reduce((s, r) => s + r.party_size, 0),
      vips: onBook.filter(r => r.is_vip).length,
      totalAll: filteredResos.length,
    };
  }, [filteredResos]);

  // ─── Filter option lists ────────────────────────────────────────

  const statuses = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reservations) counts[r.status] = (counts[r.status] || 0) + 1;
    return Object.entries(counts).sort((a, b) => (STATUS_ORDER[a[0]] || 9) - (STATUS_ORDER[b[0]] || 9));
  }, [reservations]);

  const uniqueBookers = useMemo(() =>
    [...new Set(reservations.map(r => r.booked_by).filter(Boolean) as string[])].sort(),
  [reservations]);

  const hasActiveFilters = !!statusFilter || !!bookedByFilter || vipOnly;
  const activeFilterCount = [statusFilter, bookedByFilter, vipOnly].filter(Boolean).length;

  const cycleSortField = () => {
    const order: SortField[] = ['time', 'name'];
    setSortField(prev => order[(order.indexOf(prev) + 1) % order.length]);
  };

  const clearFilters = () => {
    setStatusFilter('');
    setBookedByFilter('');
    setVipOnly(false);
    setSearch('');
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="page-header">Reservations</h1>
        <p className="text-sm text-muted-foreground">
          {isFutureDate
            ? 'Capacity and occupancy projection'
            : 'Reservation data with utilization and demand signals'}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateSelector
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onToday={() => setSelectedDate(todayISO())}
        />

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, table, server..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Button variant="outline" size="sm" onClick={cycleSortField} className="h-9 text-xs gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortField === 'time' ? 'Time' : 'Name'}
        </Button>

        <Button
          variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFiltersOpen(prev => !prev)}
          className="h-9 text-xs gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
          {activeFilterCount > 0 && (
            <Badge variant="outline" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Collapsible filters */}
      {filtersOpen && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {statuses.length > 1 && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-8 text-xs px-2 rounded-md border border-input bg-background text-foreground appearance-none cursor-pointer"
            >
              <option value="">All Status</option>
              {statuses.map(([s, n]) => (
                <option key={s} value={s}>{s} ({n})</option>
              ))}
            </select>
          )}
          {uniqueBookers.length > 1 && (
            <select
              value={bookedByFilter}
              onChange={e => setBookedByFilter(e.target.value)}
              className="h-8 text-xs px-2 rounded-md border border-input bg-background text-foreground appearance-none cursor-pointer"
            >
              <option value="">All Sources</option>
              {uniqueBookers.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
          {resoTotals.vips > 0 && (
            <Button
              variant={vipOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVipOnly(v => !v)}
              className="h-8 text-xs gap-1"
            >
              <Star className="h-3 w-3" />
              VIP ({reservations.filter(r => r.is_vip).length})
            </Button>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground">
              Clear
            </Button>
          )}
        </div>
      )}

      {/* All Venues prompt */}
      {isHydrated && (!selectedVenue || isAllVenues) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Select a venue to view reservation data.</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Card>
          <CardContent className="py-8 text-center text-red-500 text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Main content */}
      {!loading && !error && isHydrated && selectedVenue && !isAllVenues && (
        <>
          {/* Summary cards (past/today) */}
          {!isFutureDate && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <CalendarCheck className="w-8 h-8 text-keva-sage-600 shrink-0" />
                  <div>
                    <div className="text-sm text-muted-foreground">Seated</div>
                    <div className="text-2xl font-bold">
                      {stats?.posValidated?.parties || resoTotals.count}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stats?.posValidated?.covers || resoTotals.covers} covers
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Star className="w-8 h-8 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-sm text-muted-foreground">VIPs</div>
                    <div className="text-2xl font-bold">{resoTotals.vips}</div>
                    <div className="text-xs text-muted-foreground">of {stats?.posValidated?.parties || resoTotals.count} seated</div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Outlook (future dates) */}
          {isFutureDate && outlookLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Projecting outlook...
            </div>
          )}

          {isFutureDate && !outlookLoading && outlook && (
            <>
              {/* Outlook summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Eye className="w-8 h-8 text-keva-sage-600 shrink-0" />
                    <div>
                      <div className="text-sm text-muted-foreground">Book Status</div>
                      <div className="text-2xl font-bold">{outlook.summary.totalCovers}</div>
                      <div className="text-xs text-muted-foreground">
                        {outlook.summary.totalReservations} reservations · {outlook.summary.confirmed} confirmed · {outlook.summary.pending} pending
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Gauge className={`w-8 h-8 shrink-0 ${
                      outlook.summary.peakUtilizationPct >= 90 ? 'text-red-500' :
                      outlook.summary.peakUtilizationPct >= 70 ? 'text-amber-500' : 'text-emerald-500'
                    }`} />
                    <div>
                      <div className="text-sm text-muted-foreground">Peak Pressure</div>
                      <div className="text-2xl font-bold">{outlook.summary.peakUtilizationPct}%</div>
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const peakSlot = outlook.slots.reduce((best, s) =>
                            s.tablesBooked > (best?.tablesBooked || 0) ? s : best, outlook.slots[0]);
                          return peakSlot ? `Peak at ${peakSlot.label}` : 'No slots';
                        })()}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-8 h-8 text-keva-sage-600 shrink-0" />
                    <div>
                      <div className="text-sm text-muted-foreground">Tables Available</div>
                      <div className="text-2xl font-bold">
                        {(() => {
                          const maxAvail = Math.max(...outlook.slots.map(s => s.tablesAvailable), 0);
                          return maxAvail;
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        of {outlook.summary.totalTables} total · {outlook.summary.totalSeats} seats
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className={`w-8 h-8 shrink-0 ${
                      outlook.summary.historicalNoShowRate >= 0.1 ? 'text-red-500' :
                      outlook.summary.historicalNoShowRate >= 0.05 ? 'text-amber-500' : 'text-emerald-500'
                    }`} />
                    <div>
                      <div className="text-sm text-muted-foreground">No-Show Buffer</div>
                      <div className="text-2xl font-bold">{Math.round(outlook.summary.historicalNoShowRate * 100)}%</div>
                      <div className="text-xs text-muted-foreground">
                        {outlook.overbookSuggestions.length > 0
                          ? `${outlook.overbookSuggestions.reduce((s, o) => s + o.suggestedExtra, 0)} extra covers suggested`
                          : 'No overbook needed'}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Booking Manager Action Panel */}
              <BookingActionPanel outlook={outlook} />

              {/* Demand Calendar Context */}
              <DemandCalendarCard
                venueId={selectedVenue.id}
                date={selectedDate}
              />

              {/* AI Pacing Recommendations */}
              <RecommendationBanner
                venueId={selectedVenue.id}
                date={selectedDate}
                onApplied={() => {
                  // Re-fetch outlook to reflect applied recommendation
                  fetch(`/api/sales/reservations/outlook?venue_id=${selectedVenue.id}&date=${selectedDate}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => { if (data) setOutlook(data); })
                    .catch(() => {});
                }}
              />

              {/* Time Slot Grid */}
              {outlook.slots.length > 0 && (
                <Card className="mb-4">
                  <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Time Slot Projection</h3>
                    {outlook.shiftDataSource === 'sevenrooms' && outlook.summary.shiftName && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                        {outlook.summary.shiftName}
                        {outlook.summary.coversPerInterval && (
                          <> · {outlook.summary.coversPerInterval} covers/{outlook.summary.intervalMinutes}min</>
                        )}
                      </span>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-center">Tables</TableHead>
                        <TableHead className="text-center">Covers</TableHead>
                        {outlook.shiftDataSource === 'sevenrooms' && (
                          <TableHead className="text-center">Pacing</TableHead>
                        )}
                        <TableHead className="text-center">Seats Avail</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Overbook</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outlook.slots.map(slot => {
                        const suggestion = outlook.overbookSuggestions.find(s => s.slotLabel === slot.label);
                        const atPacingCeiling = slot.pacingLimit !== null && slot.coversBooked >= slot.pacingLimit;
                        const nearPacingCeiling = slot.pacingLimit !== null && slot.coversBooked >= slot.pacingLimit * 0.8;
                        return (
                          <TableRow key={slot.label}>
                            <TableCell className="font-sans font-medium text-sm">{slot.label}</TableCell>
                            <TableCell className="text-center text-sm">
                              {slot.tablesBooked}/{outlook.summary.totalTables}
                            </TableCell>
                            <TableCell className="text-center text-sm">{slot.coversBooked}</TableCell>
                            {outlook.shiftDataSource === 'sevenrooms' && (
                              <TableCell className={`text-center text-sm font-medium ${
                                atPacingCeiling ? 'text-red-500' :
                                nearPacingCeiling ? 'text-amber-500' : 'text-muted-foreground'
                              }`}>
                                {slot.pacingLimit !== null
                                  ? `${slot.coversBooked}/${slot.pacingLimit}`
                                  : '—'}
                              </TableCell>
                            )}
                            <TableCell className={`text-center text-sm ${slot.seatsAvailable < 0 ? 'text-red-500 font-semibold' : ''}`}>
                              {slot.seatsAvailable}
                            </TableCell>
                            <TableCell className="text-center">
                              <SlotStatusBadge status={slot.status} />
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {suggestion ? (
                                <span className="flex items-center justify-center gap-1 text-amber-600 font-medium">
                                  <Plus className="h-3 w-3" />
                                  {suggestion.suggestedExtra}
                                </span>
                              ) : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}

              {/* Access Rule Channel Allocation */}
              {outlook.accessRules && outlook.accessRules.length > 0 && (
                <Card className="mb-4">
                  <div className="px-4 pt-4 pb-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-keva-sage-600" />
                      Channel Allocation
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">Live</Badge>
                    </h3>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    {outlook.accessRules.map((shift) => (
                      <div key={shift.shiftName}>
                        {outlook.accessRules!.length > 1 && (
                          <div className="text-xs text-muted-foreground font-medium mb-2">{shift.shiftName}</div>
                        )}
                        {shift.accessRules.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic">All slots request-only (no pacing rules attached)</div>
                        ) : (
                          <div className="space-y-2">
                            {shift.accessRules.map((rule) => {
                              const slotsWithData = rule.slots.filter(s => s.coversRemaining !== null);
                              const totalCapacity = slotsWithData.length * (rule.pacingLimit ?? 0);
                              const totalRemaining = slotsWithData.reduce((s, sl) => s + (sl.coversRemaining ?? 0), 0);
                              const totalBooked = totalCapacity - totalRemaining;
                              const utilizationPct = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;
                              const fullSlots = slotsWithData.filter(s => (s.coversRemaining ?? 0) === 0);
                              const tightSlots = slotsWithData.filter(s => (s.coversRemaining ?? 0) > 0 && (s.coversRemaining ?? 0) <= 5);

                              return (
                                <div key={rule.ruleId} className="bg-muted/40 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{rule.description || 'Access Rule'}</span>
                                      {rule.pacingLimit && (
                                        <span className="text-[10px] text-muted-foreground">{rule.pacingLimit}/slot</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {rule.minSpend && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">${rule.minSpend} min</Badge>
                                      )}
                                      <span className={`text-xs font-semibold ${
                                        utilizationPct >= 90 ? 'text-red-500' :
                                        utilizationPct >= 70 ? 'text-amber-500' : 'text-emerald-600'
                                      }`}>
                                        {utilizationPct}%
                                      </span>
                                    </div>
                                  </div>

                                  {/* Utilization bar */}
                                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-1.5">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        utilizationPct >= 90 ? 'bg-red-500' :
                                        utilizationPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(100, utilizationPct)}%` }}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>{totalBooked}/{totalCapacity} covers across {slotsWithData.length} slots</span>
                                    <div className="flex items-center gap-2">
                                      {fullSlots.length > 0 && (
                                        <span className="text-red-500">{fullSlots.length} full</span>
                                      )}
                                      {tightSlots.length > 0 && (
                                        <span className="text-amber-500">{tightSlots.length} tight</span>
                                      )}
                                    </div>
                                  </div>

                                  {(rule.serviceCharge > 0 || rule.gratuity > 0) && (
                                    <div className="text-[10px] text-muted-foreground mt-1">
                                      Svc {rule.serviceCharge}% + Grat {rule.gratuity}%
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {shift.requestOnlySlots.length > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-2">
                            {shift.requestOnlySlots.length} request-only slots ({shift.requestOnlySlots.slice(0, 4).join(', ')}{shift.requestOnlySlots.length > 4 ? '...' : ''})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Pacing Controls */}
              <PacingControlPanel
                venueId={selectedVenue.id}
                outlook={outlook}
                onSaved={() => {
                  // Re-fetch outlook to reflect updated pacing
                  fetch(`/api/sales/reservations/outlook?venue_id=${selectedVenue.id}&date=${selectedDate}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => { if (data) setOutlook(data); })
                    .catch(() => {});
                }}
              />

              {/* Table Type Availability */}
              <div className="mb-6">
                <Card className="p-4">
                  <h3 className="font-semibold text-sm mb-3">Table Type Availability</h3>
                  <div className="space-y-3">
                    {outlook.byTableType.map(tt => {
                      const openTables = tt.totalTables - tt.bookedTables;
                      return (
                        <div key={tt.type} className="flex items-center justify-between">
                          <span className="text-sm font-medium">{tt.type}</span>
                          <span className="text-sm text-muted-foreground">
                            {openTables === 0
                              ? <span className="text-red-500 font-medium">all booked</span>
                              : <>{openTables} of {tt.totalTables} open</>
                            }
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {outlook.byTableType.length > 0 && (
                    <div className="border-t border-border mt-4 pt-3 text-xs text-muted-foreground">
                      Avg projected turn: {fmtDuration(
                        Math.round(outlook.byTableType.reduce((s, t) => s + t.avgProjectedTurn, 0) / outlook.byTableType.length)
                      )}
                    </div>
                  )}
                </Card>
              </div>

              {/* Cancelled count */}
              {outlook.summary.cancelled > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                  <XCircle className="h-4 w-4 text-red-400" />
                  {outlook.summary.cancelled} cancellations for this date
                </div>
              )}
            </>
          )}

          {/* Outlook empty state */}
          {isFutureDate && !outlookLoading && outlook && outlook.summary.totalReservations === 0 && outlook.summary.totalTables === 0 && (
            <Card className="mb-6">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Eye className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No reservations or table data for this date.</p>
              </CardContent>
            </Card>
          )}

          {/* Utilization Stats (past/today only) */}
          {!isFutureDate && statsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Computing utilization...
            </div>
          )}

          {!isFutureDate && !statsLoading && stats && stats.overall.totalTurns > 0 && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-8 h-8 text-keva-sage-600 shrink-0" />
                    <div>
                      <div className="text-sm text-muted-foreground">Avg Turn Time</div>
                      <div className="text-2xl font-bold">{fmtDuration(stats.overall.avgTurnMinutes)}</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.overall.totalTurns} turns across {stats.tableTypes.reduce((s, t) => s + t.tableCount, 0)} tables
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <BarChart3 className={`w-8 h-8 shrink-0 ${
                      stats.overall.utilizationPct >= 75 ? 'text-emerald-500' :
                      stats.overall.utilizationPct >= 50 ? 'text-amber-500' : 'text-red-500'
                    }`} />
                    <div>
                      <div className="text-sm text-muted-foreground">Utilization</div>
                      <div className="text-2xl font-bold">{stats.overall.utilizationPct}%</div>
                      <div className="text-xs text-muted-foreground">
                        {stats.overall.occupiedSeatHours} / {stats.overall.availableSeatHours} seat-hours
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-8 h-8 text-red-500 shrink-0" />
                    <div>
                      <div className="text-sm text-muted-foreground">Lost Revenue</div>
                      <div className="text-2xl font-bold">{fmt(stats.lostRevenue.demandConstrained)}</div>
                      <div className="text-xs text-muted-foreground">
                        Gaps: {fmt(stats.lostRevenue.fromGaps)} · Dead seats: {fmt(stats.lostRevenue.fromDeadSeats)}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Table type breakdown + demand signals */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <Card className="lg:col-span-2">
                  <div className="px-4 pt-4 pb-2">
                    <h3 className="font-semibold text-sm">Turn Times by Table Type</h3>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-center">Tables</TableHead>
                        <TableHead className="text-center">Avg Turns</TableHead>
                        <TableHead className="text-center">Avg Duration</TableHead>
                        <TableHead className="text-right">Avg Revenue</TableHead>
                        <TableHead className="text-right">Utilization</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.tableTypes.map(tt => (
                        <TableRow key={tt.type}>
                          <TableCell className="font-sans font-medium text-sm">{tt.type}</TableCell>
                          <TableCell className="text-center text-sm">{tt.tableCount}</TableCell>
                          <TableCell className="text-center text-sm">{tt.avgTurns}</TableCell>
                          <TableCell className="text-center text-sm">{fmtDuration(tt.avgTurnMinutes)}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(tt.avgRevenue)}</TableCell>
                          <TableCell className="text-right text-sm">{tt.utilizationPct}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                <Card className="p-4">
                  <h3 className="font-semibold text-sm mb-3">Demand Signals</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <XCircle className="h-4 w-4 text-red-400" />
                        Cancellations
                      </span>
                      <span className="text-sm font-medium">{stats.demandSignals.cancellations} covers</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <UserX className="h-4 w-4 text-red-500" />
                        No-shows
                      </span>
                      <span className="text-sm font-medium">{stats.demandSignals.noShows} covers</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Footprints className="h-4 w-4 text-blue-500" />
                        Walk-ins
                      </span>
                      <span className="text-sm font-medium">{stats.demandSignals.walkIns} covers</span>
                    </div>
                  </div>

                  <div className="border-t border-border mt-4 pt-3">
                    <div className="text-xs text-muted-foreground">Service Window</div>
                    <div className="text-sm font-medium mt-0.5">
                      {stats.serviceWindow.start
                        ? `${stats.serviceWindow.start} – ${stats.serviceWindow.end}`
                        : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmtDuration(stats.serviceWindow.durationMinutes)} · {fmt(stats.overall.revenuePerCoverHour)}/cover-hour
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* Reservations table */}
          {filteredResos.length > 0 && (
            <Card className="mb-6">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  Reservations
                  <span className="ml-2 text-muted-foreground font-normal">({filteredResos.length})</span>
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Time</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead className="w-[60px] text-center">Party</TableHead>
                    <TableHead className="w-[70px]">Table</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResos.map(reso => (
                    <ResoRows
                      key={reso.id}
                      reso={reso}
                      expanded={expandedRowId === reso.id}
                      onToggle={() => setExpandedRowId(prev => prev === reso.id ? null : reso.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Empty state */}
          {!loading && reservations.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CalendarCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="mb-1 font-medium">No reservations found</p>
                <p className="text-sm">Try a different date or venue.</p>
              </CardContent>
            </Card>
          )}

          {/* Footer totals */}
          {reservations.length > 0 && (
            <div className="flex items-center gap-6 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <CalendarCheck className="h-3 w-3" />
                {stats?.posValidated?.parties || resoTotals.count} seated
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {stats?.posValidated?.covers || resoTotals.covers} covers
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function DateSelector({
  selectedDate,
  onDateChange,
  onToday,
}: {
  selectedDate: string;
  onDateChange: (date: string) => void;
  onToday: () => void;
}) {
  const [calOpen, setCalOpen] = useState(false);

  const dateObj = (() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  })();

  const displayLabel = dateObj.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(shiftDate(selectedDate, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-sm font-medium px-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {displayLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateObj}
            onSelect={(day) => {
              if (day) {
                const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                onDateChange(iso);
                setCalOpen(false);
              }
            }}
            defaultMonth={dateObj}
          />
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDateChange(shiftDate(selectedDate, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onToday}>
        Today
      </Button>
    </div>
  );
}

function ResoRows({
  reso,
  expanded,
  onToggle,
}: {
  reso: Reservation;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="text-xs">{fmtTime(reso.arrival_time)}</TableCell>
        <TableCell className="font-sans">
          <div className="flex items-center gap-1.5 text-sm">
            {reso.is_vip && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
            <span className="font-medium">{reso.first_name} {reso.last_name}</span>
          </div>
        </TableCell>
        <TableCell className="text-center text-xs">{reso.party_size}</TableCell>
        <TableCell className="text-xs">{reso.table_number || reso.venue_seating_area_name || '—'}</TableCell>
        <TableCell>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[reso.status] || ''}`}>
            {reso.status}
          </Badge>
        </TableCell>
        <TableCell className="text-xs font-sans truncate max-w-[120px]">{reso.booked_by || '—'}</TableCell>
        <TableCell className="text-center">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="font-sans">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-1 text-xs">
              {reso.seated_time && (
                <div>
                  <span className="text-muted-foreground">Seated:</span>{' '}
                  <span className="font-medium">{fmtTime(reso.seated_time)}</span>
                </div>
              )}
              {reso.left_time && (
                <div>
                  <span className="text-muted-foreground">Left:</span>{' '}
                  <span className="font-medium">{fmtTime(reso.left_time)}</span>
                </div>
              )}
              {reso.venue_seating_area_name && (
                <div>
                  <span className="text-muted-foreground">Area:</span>{' '}
                  <span className="font-medium">{reso.venue_seating_area_name}</span>
                </div>
              )}
              {reso.min_price != null && reso.min_price > 0 && (
                <div>
                  <span className="text-muted-foreground">Min Spend:</span>{' '}
                  <span className="font-medium text-amber-600">{fmt(reso.min_price)}</span>
                </div>
              )}
              {reso.reservation_type && (
                <div>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  <span className="font-medium">{reso.reservation_type}</span>
                </div>
              )}
            </div>

            {/* Notes */}
            {(reso.notes || reso.client_requests) && (
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                {reso.notes && <p><span className="font-medium text-foreground">Notes:</span> {reso.notes}</p>}
                {reso.client_requests && <p><span className="font-medium text-foreground">Client Requests:</span> {reso.client_requests}</p>}
              </div>
            )}

            {/* Tags */}
            {reso.tags && reso.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {reso.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const SLOT_STATUS_STYLES: Record<SlotStatus, string> = {
  open: 'border-emerald-500 text-emerald-500',
  tight: 'border-amber-500 text-amber-500',
  full: 'border-red-500 text-red-500',
  overbooked: 'border-red-600 text-red-100 bg-red-600',
};

function SlotStatusBadge({ status }: { status: SlotStatus }) {
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 uppercase ${SLOT_STATUS_STYLES[status]}`}>
      {status}
    </Badge>
  );
}

// ─── Booking Manager Action Panel ───────────────────────────────────
//
// Answers "where should I send the next incoming reservation request?"
// Two categories:
//   Open    — genuine pacing headroom; book freely up to the ceiling
//   Buffer  — at/near pacing ceiling but no-show rate justifies extras
//
// Full slots are intentionally excluded — managers see those in the
// time slot grid above.

interface ActionItem {
  label: string;
  booked: number;
  ceiling: number | null;
  canTake: number;
  effectiveCovers: number | null; // only set for buffer items
  type: 'open' | 'buffer';
}

function BookingActionPanel({ outlook }: { outlook: OutlookData }) {
  const suggestMap = new Map(outlook.overbookSuggestions.map(s => [s.slotLabel, s]));
  const hasPacing = outlook.shiftDataSource === 'sevenrooms';
  const noShowPct = Math.round(outlook.summary.historicalNoShowRate * 100);

  const items: ActionItem[] = [];

  if (hasPacing) {
    // With SR pacing data: show both open headroom and algorithm slots
    for (const slot of outlook.slots) {
      if (slot.coversBooked === 0) continue;
      const suggestion = suggestMap.get(slot.label);
      if (suggestion) {
        items.push({
          label: slot.label,
          booked: slot.coversBooked,
          ceiling: slot.pacingLimit,
          canTake: suggestion.suggestedExtra,
          effectiveCovers: suggestion.effectiveCovers,
          type: 'buffer',
        });
      } else if (slot.pacingHeadroom !== null && slot.pacingHeadroom > 0) {
        items.push({
          label: slot.label,
          booked: slot.coversBooked,
          ceiling: slot.pacingLimit,
          canTake: slot.pacingHeadroom,
          effectiveCovers: null,
          type: 'open',
        });
      }
    }
  } else {
    // No SR pacing: only surface algorithm suggestions (no-show buffer)
    for (const s of outlook.overbookSuggestions) {
      items.push({
        label: s.slotLabel,
        booked: s.currentCovers,
        ceiling: s.pacingLimit,
        canTake: s.suggestedExtra,
        effectiveCovers: s.effectiveCovers,
        type: 'buffer',
      });
    }
  }

  if (items.length === 0) return null;

  const openItems = items.filter(i => i.type === 'open');
  const bufferItems = items.filter(i => i.type === 'buffer');
  const totalCanTake = items.reduce((s, i) => s + i.canTake, 0);

  return (
    <Card className="mb-4 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">Booking Headroom</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Where to direct incoming requests to maximize covers
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-xs font-semibold">
          +{totalCanTake} covers available
        </Badge>
      </div>

      {openItems.length > 0 && (
        <div className={bufferItems.length > 0 ? 'mb-3' : ''}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Open — Book Freely
          </div>
          <div className="space-y-1.5">
            {openItems.map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="w-[72px] text-xs font-medium font-sans shrink-0">{item.label}</span>
                {item.ceiling !== null && (
                  <span className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">
                    {item.booked}/{item.ceiling}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Plus className="h-3 w-3" />
                  Take up to {item.canTake} more
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bufferItems.length > 0 && (
        <div className={openItems.length > 0 ? 'border-t border-border pt-3' : ''}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            No-Show Buffer — {noShowPct}% Historical Rate
          </div>
          <div className="space-y-1.5">
            {bufferItems.map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="w-[72px] text-xs font-medium font-sans shrink-0">{item.label}</span>
                {item.ceiling !== null && (
                  <span className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">
                    {item.booked}/{item.ceiling}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Plus className="h-3 w-3" />
                  Take up to {item.canTake} more
                </span>
                {item.effectiveCovers !== null && (
                  <span className="text-xs text-muted-foreground">
                    → ~{item.effectiveCovers} effective after no-shows
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border">
            {outlook.overbookSuggestions[0]?.reason}
          </p>
        </div>
      )}
    </Card>
  );
}
