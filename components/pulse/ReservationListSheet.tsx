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
  DollarSign,
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────────────

interface MatchedCheck {
  id: string;
  revenue_total: number;
  employee_name: string;
  tip_total: number;
  comp_total: number;
  guest_count: number;
}

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
  matched_checks: MatchedCheck[] | null;
  matched_revenue: number;
}

interface UnmatchedCheck {
  id: string;
  table_name: string;
  employee_name: string;
  guest_count: number;
  revenue_total: number;
  comp_total: number;
  tip_total: number;
  open_time: string | null;
  close_time: string | null;
  is_open: boolean;
}

interface ReservationListSheetProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  date: string;
  onSelectCheck?: (checkId: string) => void;
}

type TabValue = 'all' | 'reservations' | 'checks';
type SortField = 'time' | 'name' | 'spend';

// ─── Helpers ────────────────────────────────────────────────────────

const fmtTime = (time: string | null) => {
  if (!time) return '';
  if (time.match(/^\d{2}:\d{2}/)) {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  try {
    return new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const STATUS_COLORS: Record<string, string> = {
  SEATED: 'border-emerald-500 text-emerald-500',
  ARRIVED: 'border-blue-500 text-blue-500',
  CONFIRMED: 'border-amber-500 text-amber-500',
  PENDING: 'border-muted-foreground text-muted-foreground',
  COMPLETE: 'border-muted-foreground/50 text-muted-foreground/50',
  CANCELLED: 'border-red-500 text-red-500',
  PAID: 'border-violet-500 text-violet-500',
};

const STATUS_ORDER: Record<string, number> = {
  SEATED: 1, ARRIVED: 2, CONFIRMED: 3, PENDING: 4, PAID: 5, COMPLETE: 6, CANCELLED: 7,
};

// Unified row for "All" tab interleaving
type UnifiedRow =
  | { kind: 'reso'; data: Reservation; sortTime: string }
  | { kind: 'check'; data: UnmatchedCheck; sortTime: string };

// ─── Component ──────────────────────────────────────────────────────

export function ReservationListSheet({
  isOpen,
  onClose,
  venueId,
  venueName,
  date,
  onSelectCheck,
}: ReservationListSheetProps) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [checks, setChecks] = useState<UnmatchedCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [bookedByFilter, setBookedByFilter] = useState('');
  const [serverFilter, setServerFilter] = useState('');
  const [vipOnly, setVipOnly] = useState(false);

  // Fetch data
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    fetch(`/api/sales/reservations?venue_id=${venueId}&date=${date}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Server error (${res.status})`);
        return data;
      })
      .then(data => {
        setReservations(data.reservations || []);
        setChecks(data.checks || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, venueId, date]);

  // ─── Filtered + sorted data ──────────────────────────────────────

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
      if (sortField === 'spend') return (b.matched_revenue || 0) - (a.matched_revenue || 0);
      return (a.arrival_time || '99:99').localeCompare(b.arrival_time || '99:99');
    });
  }, [reservations, search, statusFilter, bookedByFilter, vipOnly, sortField]);

  const filteredChecks = useMemo(() => {
    let list = checks;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.employee_name.toLowerCase().includes(q) ||
        c.table_name.toLowerCase().includes(q)
      );
    }
    if (serverFilter) list = list.filter(c => c.employee_name === serverFilter);
    return [...list].sort((a, b) => {
      if (sortField === 'name') return a.employee_name.localeCompare(b.employee_name);
      if (sortField === 'spend') return b.revenue_total - a.revenue_total;
      // time: newest first for checks
      const aT = a.open_time || '';
      const bT = b.open_time || '';
      return bT.localeCompare(aT);
    });
  }, [checks, search, serverFilter, sortField]);

  // All tab: interleave both types by time
  const allRows = useMemo<UnifiedRow[]>(() => {
    const rows: UnifiedRow[] = [];
    for (const r of filteredResos) rows.push({ kind: 'reso', data: r, sortTime: r.arrival_time || '99:99' });
    for (const c of filteredChecks) rows.push({ kind: 'check', data: c, sortTime: c.open_time || '' });

    if (sortField === 'spend') {
      return rows.sort((a, b) => {
        const aSpend = a.kind === 'reso' ? (a.data.matched_revenue || 0) : a.data.revenue_total;
        const bSpend = b.kind === 'reso' ? (b.data.matched_revenue || 0) : b.data.revenue_total;
        return bSpend - aSpend;
      });
    }
    if (sortField === 'name') {
      return rows.sort((a, b) => {
        const aName = a.kind === 'reso' ? `${a.data.last_name} ${a.data.first_name}` : a.data.employee_name;
        const bName = b.kind === 'reso' ? `${b.data.last_name} ${b.data.first_name}` : b.data.employee_name;
        return aName.localeCompare(bName);
      });
    }
    // time sort: ascending
    return rows.sort((a, b) => a.sortTime.localeCompare(b.sortTime));
  }, [filteredResos, filteredChecks, sortField]);

  // ─── Totals per tab ──────────────────────────────────────────────

  const resoTotals = useMemo(() => ({
    count: filteredResos.length,
    covers: filteredResos.reduce((s, r) => s + r.party_size, 0),
    revenue: filteredResos.reduce((s, r) => s + (r.matched_revenue || 0), 0),
    vips: filteredResos.filter(r => r.is_vip).length,
    matched: filteredResos.filter(r => r.matched_checks && r.matched_checks.length > 0).length,
  }), [filteredResos]);

  const checkTotals = useMemo(() => ({
    count: filteredChecks.length,
    covers: filteredChecks.reduce((s, c) => s + c.guest_count, 0),
    revenue: filteredChecks.reduce((s, c) => s + c.revenue_total, 0),
    tips: filteredChecks.reduce((s, c) => s + c.tip_total, 0),
  }), [filteredChecks]);

  // ─── Ledger tab: all checks (matched + unmatched) ────────────────
  type LedgerCheck = UnmatchedCheck & { guest_name?: string };

  const ledgerData = useMemo(() => {
    // Extract matched checks from reservations
    const matched: LedgerCheck[] = [];
    for (const r of filteredResos) {
      if (r.matched_checks?.length) {
        for (const mc of r.matched_checks) {
          matched.push({
            id: mc.id,
            table_name: r.table_number || '',
            employee_name: mc.employee_name,
            guest_count: mc.guest_count,
            revenue_total: mc.revenue_total,
            comp_total: mc.comp_total,
            tip_total: mc.tip_total,
            open_time: r.seated_time || r.arrival_time,
            close_time: r.left_time,
            is_open: false,
            guest_name: `${r.first_name} ${r.last_name}`,
          });
        }
      }
    }
    // Sort each group by spend descending
    const sortFn = (a: LedgerCheck, b: LedgerCheck) => {
      if (sortField === 'name') return a.employee_name.localeCompare(b.employee_name);
      if (sortField === 'spend') return b.revenue_total - a.revenue_total;
      const aT = a.open_time || '';
      const bT = b.open_time || '';
      return bT.localeCompare(aT);
    };
    matched.sort(sortFn);
    const unmatched = [...filteredChecks].sort(sortFn);
    const allRevenue = matched.reduce((s, c) => s + c.revenue_total, 0) + checkTotals.revenue;
    const allCount = matched.length + unmatched.length;
    return { matched, unmatched, allRevenue, allCount };
  }, [filteredResos, filteredChecks, sortField, checkTotals.revenue]);

  // ─── Filter options ──────────────────────────────────────────────

  const statuses = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reservations) counts[r.status] = (counts[r.status] || 0) + 1;
    return Object.entries(counts).sort((a, b) => (STATUS_ORDER[a[0]] || 9) - (STATUS_ORDER[b[0]] || 9));
  }, [reservations]);

  const uniqueBookers = useMemo(() =>
    [...new Set(reservations.map(r => r.booked_by).filter(Boolean) as string[])].sort(),
  [reservations]);

  const uniqueServers = useMemo(() =>
    [...new Set(checks.map(c => c.employee_name).filter(Boolean))].sort(),
  [checks]);

  const hasActiveFilters = !!statusFilter || !!bookedByFilter || !!serverFilter || vipOnly;
  const activeFilterCount = [statusFilter, bookedByFilter, serverFilter, vipOnly].filter(Boolean).length;

  const handleResoClick = (reso: Reservation) => {
    if (!onSelectCheck || !reso.matched_checks?.length) return;
    const best = reso.matched_checks.reduce((a, b) => b.revenue_total > a.revenue_total ? b : a);
    onSelectCheck(best.id);
  };

  const cycleSortField = () => {
    const order: SortField[] = ['time', 'spend', 'name'];
    setSortField(prev => order[(order.indexOf(prev) + 1) % order.length]);
  };

  const clearFilters = () => {
    setStatusFilter('');
    setBookedByFilter('');
    setServerFilter('');
    setVipOnly(false);
    setSearch('');
  };

  // ─── Visible list ────────────────────────────────────────────────

  const visibleCount = tab === 'all' ? allRows.length
    : tab === 'reservations' ? filteredResos.length
    : ledgerData.allCount;

  const totalRaw = reservations.length + checks.length;

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Guest Ledger
            {!loading && (
              <Badge variant="default" className="text-xs">
                {hasActiveFilters || search ? `${visibleCount} of ${totalRaw}` : totalRaw}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {venueName} &middot; {date}
          </SheetDescription>
        </SheetHeader>

        {/* Tab bar */}
        <div className="px-4 pb-1 flex items-center gap-1">
          {(['all', 'reservations', 'checks'] as TabValue[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {t === 'all' ? `All (${reservations.length + checks.length})`
                : t === 'reservations' ? `Resos (${reservations.length})`
                : `Ledger (${ledgerData.allCount})`}
            </button>
          ))}
        </div>

        {/* Search + sort + filter bar */}
        <div className="px-4 pb-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={tab === 'checks' ? 'Search server or table...' : 'Search name, server, or table...'}
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
            {sortField === 'time' ? 'Time' : sortField === 'spend' ? 'Spend' : 'Name'}
          </Button>
        </div>

        {/* Collapsible filters */}
        {filtersOpen && (
          <div className="px-4 pb-2 flex items-center gap-1.5 overflow-x-auto">
            {/* Status filter (reservation) */}
            {(tab !== 'checks') && statuses.length > 1 && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-7 text-[11px] px-2 rounded-md border border-input bg-background text-foreground shrink-0 appearance-none cursor-pointer"
              >
                <option value="">All Status</option>
                {statuses.map(([s, n]) => (
                  <option key={s} value={s}>{s} ({n})</option>
                ))}
              </select>
            )}
            {/* Booked by (reservation) */}
            {(tab !== 'checks') && uniqueBookers.length > 1 && (
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
            {/* Server filter (checks) */}
            {(tab !== 'reservations') && uniqueServers.length > 1 && (
              <select
                value={serverFilter}
                onChange={e => setServerFilter(e.target.value)}
                className="h-7 text-[11px] px-2 rounded-md border border-input bg-background text-foreground shrink-0 appearance-none cursor-pointer"
              >
                <option value="">All Servers</option>
                {uniqueServers.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {/* VIP toggle (reservation) */}
            {(tab !== 'checks') && resoTotals.vips > 0 && (
              <Button
                variant={vipOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVipOnly(v => !v)}
                className="h-7 text-[11px] px-2.5 gap-1 shrink-0"
              >
                <Star className="h-3 w-3" />
                VIP ({reservations.filter(r => r.is_vip).length})
              </Button>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-[11px] px-2 shrink-0 text-muted-foreground">
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-2" style={{ paddingBottom: visibleCount > 0 ? undefined : 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 py-8 text-center">{error}</div>
          )}

          {!loading && !error && visibleCount === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {tab === 'reservations' ? 'No reservations found.'
                : tab === 'checks' ? 'No checks in ledger.'
                : 'No data found.'}
            </div>
          )}

          {/* Reservations tab */}
          {!loading && tab === 'reservations' && filteredResos.map(reso => (
            <ResoRow key={reso.id} reso={reso} onSelectCheck={onSelectCheck} onClick={handleResoClick} />
          ))}

          {/* Ledger tab: matched + unmatched groups */}
          {!loading && tab === 'checks' && (
            <>
              {ledgerData.matched.length > 0 && (
                <>
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2 pb-1 flex items-center gap-1.5">
                    <CalendarCheck className="h-3 w-3" />
                    Matched to Reservation ({ledgerData.matched.length})
                  </div>
                  {ledgerData.matched.map(check => (
                    <CheckRow key={`m-${check.id}`} check={check} onSelectCheck={onSelectCheck} guestName={check.guest_name} />
                  ))}
                </>
              )}
              {ledgerData.unmatched.length > 0 && (
                <>
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1 pt-3 pb-1 flex items-center gap-1.5">
                    <Receipt className="h-3 w-3" />
                    Walk-ins &amp; Bar ({ledgerData.unmatched.length})
                  </div>
                  {ledgerData.unmatched.map(check => (
                    <CheckRow key={`u-${check.id}`} check={check} onSelectCheck={onSelectCheck} />
                  ))}
                </>
              )}
            </>
          )}

          {/* All tab */}
          {!loading && tab === 'all' && allRows.map(row =>
            row.kind === 'reso'
              ? <ResoRow key={`r-${row.data.id}`} reso={row.data} onSelectCheck={onSelectCheck} onClick={handleResoClick} />
              : <CheckRow key={`c-${row.data.id}`} check={row.data} onSelectCheck={onSelectCheck} />
          )}
        </div>

        {/* Footer */}
        {!loading && visibleCount > 0 && (
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/30" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
            {tab === 'checks' ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Receipt className="h-3 w-3" />
                    {ledgerData.allCount} checks
                  </span>
                  {ledgerData.matched.length > 0 && (
                    <span className="flex items-center gap-1">
                      <CalendarCheck className="h-3 w-3" />
                      {ledgerData.matched.length} matched
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <DollarSign className="h-3 w-3" />
                  {fmt(ledgerData.allRevenue)}
                </span>
              </>
            ) : tab === 'reservations' ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <CalendarCheck className="h-3 w-3" />
                    {resoTotals.count} reservations
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {resoTotals.covers} covers
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {resoTotals.revenue > 0 && (
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <DollarSign className="h-3 w-3" />
                      {fmt(resoTotals.revenue)}
                      <span className="text-muted-foreground font-normal">({resoTotals.matched} matched)</span>
                    </span>
                  )}
                  {resoTotals.vips > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" />
                      {resoTotals.vips} VIP
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <CalendarCheck className="h-3 w-3" />
                    {resoTotals.count} resos
                  </span>
                  <span className="flex items-center gap-1">
                    <Receipt className="h-3 w-3" />
                    {checkTotals.count} checks
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {resoTotals.covers + checkTotals.covers} covers
                  </span>
                </div>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <DollarSign className="h-3 w-3" />
                  {fmt(resoTotals.revenue + checkTotals.revenue)}
                </span>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Row Components ─────────────────────────────────────────────────

function ResoRow({
  reso,
  onSelectCheck,
  onClick,
}: {
  reso: Reservation;
  onSelectCheck?: (id: string) => void;
  onClick: (r: Reservation) => void;
}) {
  const hasCheck = reso.matched_checks && reso.matched_checks.length > 0;
  const hasSpend = reso.matched_revenue > 0;
  const isClickable = hasCheck && !!onSelectCheck;

  return (
    <div
      onClick={() => isClickable && onClick(reso)}
      className={`w-full text-left px-3 py-2.5 rounded-md border-b border-border/50 last:border-0 flex items-center gap-3 ${
        isClickable ? 'cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors' : ''
      }`}
    >
      <div className="min-w-[60px]">
        <div className="text-xs font-medium">{fmtTime(reso.arrival_time)}</div>
        {reso.table_number ? (
          <div className="text-[11px] text-muted-foreground font-mono">T{reso.table_number}</div>
        ) : reso.booked_by ? (
          <div className="text-[11px] text-muted-foreground truncate max-w-[80px]">{reso.booked_by}</div>
        ) : null}
      </div>

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
          {hasCheck && (
            <span className="text-muted-foreground/60">
              {reso.matched_checks!.length > 1
                ? `${reso.matched_checks!.length} checks`
                : reso.matched_checks![0].employee_name}
            </span>
          )}
        </div>
        {(reso.notes || reso.client_requests) && (
          <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
            {reso.notes || reso.client_requests}
          </div>
        )}
      </div>

      <div className="text-right shrink-0">
        {hasSpend ? (
          <div className="text-sm font-semibold tabular-nums">
            {fmt(reso.matched_revenue)}
          </div>
        ) : (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[reso.status] || ''}`}>
            {reso.status}
          </Badge>
        )}
        {hasSpend && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-0.5 ${STATUS_COLORS[reso.status] || ''}`}>
            {reso.status}
          </Badge>
        )}
        {reso.venue_seating_area_name && !reso.table_number && !hasSpend && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {reso.venue_seating_area_name}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckRow({
  check,
  onSelectCheck,
  guestName,
}: {
  check: UnmatchedCheck;
  onSelectCheck?: (id: string) => void;
  guestName?: string;
}) {
  return (
    <button
      onClick={() => onSelectCheck?.(check.id)}
      className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted/50 active:bg-muted transition-colors flex items-center gap-3 border-b border-border/50 last:border-0"
    >
      <div className="min-w-[60px]">
        <div className="text-xs font-medium">{fmtTime(check.open_time)}</div>
        <div className="text-[11px] text-muted-foreground">{check.table_name || '\u2014'}</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{guestName || check.employee_name}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {guestName && check.employee_name && (
            <span className="text-muted-foreground/70">{check.employee_name}</span>
          )}
          <span className="flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            {check.guest_count}
          </span>
          {check.comp_total > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <AlertTriangle className="h-3 w-3" />
              comp {fmt(check.comp_total)}
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{fmt(check.revenue_total)}</div>
        {check.is_open ? (
          <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-500 px-1.5 py-0">
            Open
          </Badge>
        ) : check.tip_total > 0 ? (
          <div className="text-[10px] text-muted-foreground">tip {fmt(check.tip_total)}</div>
        ) : null}
      </div>
    </button>
  );
}
