'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
  Receipt,
  Clock,
  Users,
  DollarSign,
  Loader2,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CheckSummary {
  id: string;
  table_name: string;
  employee_name: string;
  guest_count: number;
  sub_total: number;
  revenue_total: number;
  comp_total: number;
  void_total: number;
  open_time: string;
  close_time: string | null;
  is_open: boolean;
  payment_total: number;
  tip_total: number;
}

interface CheckListSheetProps {
  isOpen: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  date: string;
  onSelectCheck: (checkId: string) => void;
}

type SortField = 'time' | 'total' | 'table';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

export function CheckListSheet({
  isOpen,
  onClose,
  venueId,
  venueName,
  date,
  onSelectCheck,
}: CheckListSheetProps) {
  const [checks, setChecks] = useState<CheckSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [posType, setPosType] = useState<string>('upserve');
  const [simphonyMessage, setSimphonyMessage] = useState<string | null>(null);
  const cacheKey = useRef('');

  useEffect(() => {
    if (!isOpen) return;
    const key = `${venueId}-${date}`;
    if (cacheKey.current === key && checks.length > 0) return;

    setLoading(true);
    setError(null);
    setSimphonyMessage(null);

    fetch(`/api/sales/checks?venue_id=${venueId}&date=${date}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setChecks(data.checks || []);
          setPosType(data.pos_type || 'upserve');
          if (data.message) setSimphonyMessage(data.message);
          cacheKey.current = key;
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, venueId, date, checks.length]);

  const filtered = useMemo(() => {
    let list = checks;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        c =>
          c.employee_name.toLowerCase().includes(q) ||
          c.table_name.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortField === 'total') return b.revenue_total - a.revenue_total;
      if (sortField === 'table') return a.table_name.localeCompare(b.table_name);
      return new Date(b.open_time).getTime() - new Date(a.open_time).getTime();
    });
  }, [checks, search, sortField]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, c) => s + c.revenue_total, 0);
    const covers = filtered.reduce((s, c) => s + c.guest_count, 0);
    const tips = filtered.reduce((s, c) => s + c.tip_total, 0);
    return { revenue, covers, tips, count: filtered.length };
  }, [filtered]);

  const cycleSortField = () => {
    setSortField(prev => {
      if (prev === 'time') return 'total';
      if (prev === 'total') return 'table';
      return 'time';
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Checks
              {!loading && (
                <Badge variant="default" className="text-xs">
                  {totals.count}
                </Badge>
              )}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            {venueName} &middot; {date}
          </SheetDescription>
        </SheetHeader>

        {/* Search + sort bar */}
        <div className="px-4 pb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search server or table..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={cycleSortField} className="h-9 text-xs whitespace-nowrap">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            {sortField === 'time' ? 'Time' : sortField === 'total' ? 'Total' : 'Table'}
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 py-8 text-center">{error}</div>
          )}

          {simphonyMessage && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {simphonyMessage}
            </div>
          )}

          {!loading && !error && !simphonyMessage && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No checks found.
            </div>
          )}

          {!loading && filtered.map(check => (
            <button
              key={check.id}
              onClick={() => onSelectCheck(check.id)}
              className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted/50 active:bg-muted transition-colors flex items-center gap-3 border-b border-border/50 last:border-0"
            >
              {/* Left: time + table */}
              <div className="min-w-[60px]">
                <div className="text-xs font-medium">{fmtTime(check.open_time)}</div>
                <div className="text-[11px] text-muted-foreground">{check.table_name}</div>
              </div>

              {/* Center: server + covers */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{check.employee_name}</div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {check.guest_count}
                  {check.comp_total > 0 && (
                    <span className="text-red-400">comp {fmt(check.comp_total)}</span>
                  )}
                </div>
              </div>

              {/* Right: total + status */}
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmt(check.revenue_total)}</div>
                {check.is_open ? (
                  <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-500 px-1.5 py-0">
                    Open
                  </Badge>
                ) : (
                  <div className="text-[10px] text-muted-foreground">
                    {check.tip_total > 0 && `tip ${fmt(check.tip_total)}`}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Summary footer */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/30">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {fmt(totals.revenue)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {totals.covers} covers
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Tips: {fmt(totals.tips)}
            </span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
