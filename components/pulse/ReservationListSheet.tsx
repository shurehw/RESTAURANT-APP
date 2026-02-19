'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  CalendarCheck,
  Clock,
  Users,
  Loader2,
  ArrowUpDown,
  Search,
  Star,
  LogIn,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

interface ReservationListSheetProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  date: string;
}

type SortField = 'time' | 'name' | 'party' | 'status';
type FilterStatus = 'seated' | 'arrived' | 'confirmed' | 'complete' | 'cancelled' | 'paid' | 'vip';

const SORT_LABELS: Record<SortField, string> = {
  time: 'Time',
  name: 'Name',
  party: 'Party',
  status: 'Status',
};

const SORT_ORDER: SortField[] = ['time', 'name', 'party', 'status'];

const STATUS_COLORS: Record<string, string> = {
  SEATED: 'border-emerald-500 text-emerald-500',
  ARRIVED: 'border-blue-500 text-blue-500',
  CONFIRMED: 'border-amber-500 text-amber-500',
  PENDING: 'border-muted-foreground text-muted-foreground',
  COMPLETE: 'border-muted-foreground/50 text-muted-foreground/50',
  CANCELLED: 'border-red-500 text-red-500',
  PAID: 'border-violet-500 text-violet-500',
};

const fmtTime = (time: string | null) => {
  if (!time) return '';
  // arrival_time is "HH:MM:SS" format
  if (time.match(/^\d{2}:\d{2}/)) {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  // ISO timestamp
  try {
    return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

const STATUS_ORDER: Record<string, number> = {
  SEATED: 1,
  ARRIVED: 2,
  CONFIRMED: 3,
  PENDING: 4,
  PAID: 5,
  COMPLETE: 6,
  CANCELLED: 7,
};

export function ReservationListSheet({
  isOpen,
  onClose,
  venueId,
  venueName,
  date,
}: ReservationListSheetProps) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [filters, setFilters] = useState<Set<FilterStatus>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bookedByFilter, setBookedByFilter] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`/api/sales/reservations?venue_id=${venueId}&date=${date}`)
      .then(res => {
        if (!res.ok) throw new Error(`Server error (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setReservations(data.reservations || []);
          setTotal(data.total || 0);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, venueId, date]);

  const filtered = useMemo(() => {
    let list = reservations;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        r =>
          `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
          (r.booked_by || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
      );
    }

    // Status filters
    if (filters.has('seated')) list = list.filter(r => r.status === 'SEATED');
    if (filters.has('arrived')) list = list.filter(r => r.status === 'ARRIVED');
    if (filters.has('confirmed')) list = list.filter(r => r.status === 'CONFIRMED');
    if (filters.has('complete')) list = list.filter(r => r.status === 'COMPLETE');
    if (filters.has('cancelled')) list = list.filter(r => r.status === 'CANCELLED');
    if (filters.has('paid')) list = list.filter(r => r.status === 'PAID');
    if (filters.has('vip')) list = list.filter(r => r.is_vip);

    // Booked by filter
    if (bookedByFilter) list = list.filter(r => r.booked_by === bookedByFilter);

    // Sort
    return [...list].sort((a, b) => {
      if (sortField === 'name') return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      if (sortField === 'party') return b.party_size - a.party_size;
      if (sortField === 'status') return (STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9);
      // time: sort by arrival_time
      const aTime = a.arrival_time || '99:99';
      const bTime = b.arrival_time || '99:99';
      return aTime.localeCompare(bTime);
    });
  }, [reservations, search, filters, bookedByFilter, sortField]);

  const totals = useMemo(() => {
    const covers = filtered.reduce((s, r) => s + r.party_size, 0);
    const vips = filtered.filter(r => r.is_vip).length;
    return { covers, vips, count: filtered.length };
  }, [filtered]);

  const cycleSortField = () => {
    setSortField(prev => {
      const idx = SORT_ORDER.indexOf(prev);
      return SORT_ORDER[(idx + 1) % SORT_ORDER.length];
    });
  };

  const toggleFilter = (flag: FilterStatus) => {
    setFilters(prev => {
      const next = new Set(prev);
      // Clear other status filters when selecting a new one (mutually exclusive)
      if (['seated', 'arrived', 'confirmed', 'complete', 'cancelled', 'paid'].includes(flag)) {
        next.delete('seated');
        next.delete('arrived');
        next.delete('confirmed');
        next.delete('complete');
        next.delete('cancelled');
        next.delete('paid');
        if (!prev.has(flag)) next.add(flag);
      } else {
        if (next.has(flag)) next.delete(flag);
        else next.add(flag);
      }
      return next;
    });
  };

  // Counts for filter badges
  const filterCounts = useMemo(() => ({
    seated: reservations.filter(r => r.status === 'SEATED').length,
    arrived: reservations.filter(r => r.status === 'ARRIVED').length,
    confirmed: reservations.filter(r => r.status === 'CONFIRMED').length,
    complete: reservations.filter(r => r.status === 'COMPLETE').length,
    cancelled: reservations.filter(r => r.status === 'CANCELLED').length,
    paid: reservations.filter(r => r.status === 'PAID').length,
    vip: reservations.filter(r => r.is_vip).length,
  }), [reservations]);

  // Unique booked-by sources for dropdown
  const uniqueBookers = useMemo(() =>
    [...new Set(reservations.map(r => r.booked_by).filter(Boolean) as string[])].sort(),
  [reservations]);

  const hasActiveFilters = search || filters.size > 0 || !!bookedByFilter;
  const activeFilterCount = filters.size + (bookedByFilter ? 1 : 0);

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" />
              Reservations
              {!loading && (
                <Badge variant="default" className="text-xs">
                  {hasActiveFilters ? `${totals.count} of ${total}` : total}
                </Badge>
              )}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            {venueName} &middot; {date}
          </SheetDescription>
        </SheetHeader>

        {/* Search + sort + filter bar */}
        <div className="px-4 pb-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name or booker..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button
            variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen(prev => !prev)}
            className="h-9 text-xs whitespace-nowrap"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
            Filter
            {activeFilterCount > 0 && (
              <Badge variant="outline" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={cycleSortField} className="h-9 text-xs whitespace-nowrap">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            {SORT_LABELS[sortField]}
          </Button>
        </div>

        {/* Collapsible filters */}
        {filtersOpen && (
          <div className="px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
            {/* Booked by dropdown */}
            {uniqueBookers.length > 1 && (
              <select
                value={bookedByFilter}
                onChange={e => setBookedByFilter(e.target.value)}
                className="h-7 text-[11px] px-2 rounded-md border border-input bg-background text-foreground shrink-0 appearance-none cursor-pointer"
              >
                <option value="">All Sources</option>
                {uniqueBookers.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
            {filterCounts.vip > 0 && (
              <Button
                variant={filters.has('vip') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('vip')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                <Star className="h-3 w-3" />
                VIP ({filterCounts.vip})
              </Button>
            )}
            {filterCounts.seated > 0 && (
              <Button
                variant={filters.has('seated') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('seated')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                Seated ({filterCounts.seated})
              </Button>
            )}
            {filterCounts.arrived > 0 && (
              <Button
                variant={filters.has('arrived') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('arrived')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                Arrived ({filterCounts.arrived})
              </Button>
            )}
            {filterCounts.confirmed > 0 && (
              <Button
                variant={filters.has('confirmed') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('confirmed')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                Confirmed ({filterCounts.confirmed})
              </Button>
            )}
            {filterCounts.complete > 0 && (
              <Button
                variant={filters.has('complete') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('complete')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                Complete ({filterCounts.complete})
              </Button>
            )}
            {filterCounts.paid > 0 && (
              <Button
                variant={filters.has('paid') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('paid')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                Paid ({filterCounts.paid})
              </Button>
            )}
            {filterCounts.cancelled > 0 && (
              <Button
                variant={filters.has('cancelled') ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter('cancelled')}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                Cancelled ({filterCounts.cancelled})
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-2" style={{ paddingBottom: filtered.length > 0 ? undefined : 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 py-8 text-center">{error}</div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No reservations found.
            </div>
          )}

          {!loading && filtered.map(reso => (
            <div
              key={reso.id}
              className="w-full text-left px-3 py-2.5 rounded-md border-b border-border/50 last:border-0 flex items-center gap-3"
            >
              {/* Left: time */}
              <div className="min-w-[60px]">
                <div className="text-xs font-medium">{fmtTime(reso.arrival_time)}</div>
                {reso.booked_by && (
                  <div className="text-[11px] text-muted-foreground truncate max-w-[80px]">{reso.booked_by}</div>
                )}
              </div>

              {/* Center: name + party + meta */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {reso.is_vip && <Star className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />}
                  {reso.first_name} {reso.last_name}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Users className="h-3 w-3" />
                    {reso.party_size}
                  </span>
                  {reso.seated_time && (
                    <span className="flex items-center gap-0.5">
                      <LogIn className="h-3 w-3" />
                      {fmtTime(reso.seated_time)}
                    </span>
                  )}
                  {reso.left_time && (
                    <span className="flex items-center gap-0.5">
                      <LogOut className="h-3 w-3" />
                      {fmtTime(reso.left_time)}
                    </span>
                  )}
                  {reso.min_price != null && reso.min_price > 0 && (
                    <span className="text-amber-500">
                      min ${reso.min_price.toLocaleString()}
                    </span>
                  )}
                </div>
                {(reso.notes || reso.client_requests) && (
                  <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                    {reso.notes || reso.client_requests}
                  </div>
                )}
              </div>

              {/* Right: status */}
              <div className="text-right shrink-0">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[reso.status] || ''}`}>
                  {reso.status}
                </Badge>
                {reso.venue_seating_area_name && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {reso.venue_seating_area_name}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary footer */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/30" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <CalendarCheck className="h-3 w-3" />
                {totals.count} reservations
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {totals.covers} covers
              </span>
            </div>
            {totals.vips > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500" />
                {totals.vips} VIP
              </span>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
