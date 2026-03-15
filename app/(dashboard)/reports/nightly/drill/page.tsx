'use client';

/**
 * Nightly Report Drill-Through Page
 * Clean, narrow, mobile-first view for email deep-links.
 * Shows a single section (comps, servers, items, labor, categories)
 * scoped to one venue + date.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertTriangle, Info, CheckCircle2, Sparkles } from 'lucide-react';
import { useVenue } from '@/components/providers/VenueProvider';

// ── Action Center types ───────────────────────────────────────────

interface ActionItem {
  id: string;
  title: string;
  description: string;
  action: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: string;
  source_type: string;
  status: string;
  related_employees?: string[];
}

// ── Types ─────────────────────────────────────────────────────────

interface Summary {
  net_sales: number;
  total_checks: number;
  total_covers: number;
  total_comps: number;
}

interface Discount { reason: string; qty: number; amount: number }
interface DetailedComp {
  check_id: string; table_name: string; server: string;
  comp_total: number; check_total: number; reason: string;
  comped_items: string[]; cardholder_name: string;
}
interface Server {
  employee_name: string; employee_role_name: string;
  tickets: number; covers: number; net_sales: number;
  avg_ticket: number; avg_per_cover?: number;
  tip_pct: number; total_tips: number;
}
interface MenuItem { name: string; qty: number; net_total: number; parent_category: string }
interface Category { category: string; gross_sales: number; comps: number; voids?: number; net_sales: number }

interface ReportData {
  summary: Summary;
  discounts: Discount[];
  detailedComps: DetailedComp[];
  servers: Server[];
  menuItems: MenuItem[];
  salesByCategory: Category[];
}

interface LaborData {
  labor_cost: number; labor_pct: number; total_hours: number;
  employee_count: number;
  foh: { hours: number; cost: number; employee_count: number } | null;
  boh: { hours: number; cost: number; employee_count: number } | null;
}

// ── Formatters ────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;
const num = (n: number) => n.toLocaleString();

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

const SECTION_TITLES: Record<string, string> = {
  comps: 'Comps',
  servers: 'Server Performance',
  items: 'Menu Items',
  labor: 'Labor',
  categories: 'Category Mix',
};

// ── Section → source_type mapping for filtering Action Center items ──

const SECTION_SOURCE_TYPES: Record<string, string[]> = {
  comps: ['ai_comp_review', 'ai_drill_insight'],
  servers: ['ai_server_coaching', 'ai_server_score', 'ai_drill_insight'],
  labor: ['ai_drill_insight'],
  items: ['ai_drill_insight'],
  categories: ['ai_drill_insight'],
};

const SECTION_CATEGORIES: Record<string, string[]> = {
  comps: ['violation'],
  servers: ['training'],
  labor: ['process'],
  items: ['process'],
  categories: ['process'],
};

function filterActionsBySection(actions: ActionItem[], section: string): ActionItem[] {
  const sourceTypes = SECTION_SOURCE_TYPES[section] || [];
  const categories = SECTION_CATEGORIES[section] || [];
  return actions.filter(a =>
    sourceTypes.includes(a.source_type) || categories.includes(a.category)
  );
}

const PRIORITY_STYLES = {
  urgent: { border: 'border-red-300 dark:border-red-800', bg: 'bg-red-50/50 dark:bg-red-950/20', icon: AlertTriangle, iconColor: 'text-red-500' },
  high: { border: 'border-red-300 dark:border-red-800', bg: 'bg-red-50/50 dark:bg-red-950/20', icon: AlertTriangle, iconColor: 'text-red-500' },
  medium: { border: 'border-amber-300 dark:border-amber-800', bg: 'bg-amber-50/50 dark:bg-amber-950/20', icon: Info, iconColor: 'text-amber-500' },
  low: { border: 'border-green-300 dark:border-green-800', bg: 'bg-green-50/50 dark:bg-green-950/20', icon: CheckCircle2, iconColor: 'text-green-500' },
} as const;

function ActionItemsPanel({ actions, loading }: { actions: ActionItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        <span>Loading action items...</span>
      </div>
    );
  }

  if (actions.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        Action Items
      </div>
      {actions.map((item) => {
        const style = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.medium;
        const Icon = style.icon;
        return (
          <div key={item.id} className={`rounded-lg border ${style.border} ${style.bg} p-3 space-y-1.5`}>
            <div className="flex items-start gap-2">
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
              <div className="min-w-0">
                <div className="text-xs font-semibold">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
              </div>
            </div>
            <div className="text-xs font-medium pl-6 text-foreground">
              &rarr; {item.action}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────

export default function DrillPage() {
  const searchParams = useSearchParams();
  const date = searchParams?.get('date') || '';
  const venueId = searchParams?.get('venue') || '';
  const section = searchParams?.get('section') || '';
  const reason = searchParams?.get('reason') || '';
  const server = searchParams?.get('server') || '';

  const { venues } = useVenue();
  const venueName = venues.find(v => v.id === venueId)?.name || 'Venue';

  const [report, setReport] = useState<ReportData | null>(null);
  const [labor, setLabor] = useState<LaborData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  useEffect(() => {
    if (!date || !venueId) { setLoading(false); setError('Missing date or venue'); return; }

    const fetchData = async () => {
      setLoading(true);
      try {
        const promises: Promise<any>[] = [
          fetch(`/api/nightly?date=${date}&venue_id=${venueId}`).then(r => r.ok ? r.json() : null),
        ];
        if (section === 'labor') {
          promises.push(
            fetch(`/api/nightly/facts?date=${date}&venue_id=${venueId}&view=nightly`).then(r => r.ok ? r.json() : null),
          );
        }
        const [reportData, factsData] = await Promise.all(promises);
        if (reportData) setReport(reportData);
        else setError('No data available');
        if (factsData?.labor) setLabor(factsData.labor);
      } catch { setError('Failed to load data'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [date, venueId, section]);

  // Fetch Action Center items, fall back to on-demand AI if none exist
  useEffect(() => {
    if (!venueId || !section) return;

    setActionsLoading(true);
    fetch(`/api/control-plane/actions?venue_id=${venueId}`)
      .then(r => r.ok ? r.json() : null)
      .then(async (res) => {
        const existing = res?.actions ? filterActionsBySection(res.actions, section) : [];
        if (existing.length > 0) {
          setActions(existing);
          setActionsLoading(false);
          return;
        }

        // No existing actions — generate on-demand if we have report data
        if (!report) { setActionsLoading(false); return; }

        const sectionData: Record<string, unknown> = { summary: report.summary };
        if (section === 'comps') { sectionData.discounts = report.discounts; sectionData.detailedComps = report.detailedComps; }
        else if (section === 'servers') { sectionData.servers = report.servers; sectionData.detailedComps = report.detailedComps; }
        else if (section === 'items') { sectionData.menuItems = report.menuItems; }
        else if (section === 'labor' && labor) { sectionData.labor = labor; }
        else if (section === 'categories') { sectionData.salesByCategory = report.salesByCategory; }

        try {
          const aiRes = await fetch('/api/ai/drill-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section, venueName, date, venueId, data: sectionData }),
          });
          const aiData = aiRes.ok ? await aiRes.json() : null;
          if (aiData?.insights?.length > 0) {
            // Map AI insights to ActionItem shape for display
            setActions(aiData.insights.map((ins: any, i: number) => ({
              id: `ai-${i}`,
              title: ins.pattern,
              description: ins.detail,
              action: ins.action,
              priority: ins.severity === 'high' ? 'high' : ins.severity === 'medium' ? 'medium' : 'low',
              category: 'ai_generated',
              source_type: 'ai_drill_insight',
              status: 'pending',
            })));
          }
        } catch {}
        setActionsLoading(false);
      })
      .catch(() => setActionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, section, report, labor]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error || 'No data available'}</p>
        <Link href={`/reports/nightly`} className="text-sm text-brass underline">
          Go to Nightly Reports
        </Link>
      </div>
    );
  }

  const s = report.summary;
  const compPct = s.net_sales > 0 ? (s.total_comps / (s.net_sales + s.total_comps)) * 100 : 0;
  const sectionTitle = reason
    ? `Comps: ${decodeURIComponent(reason)}`
    : server
    ? `Server: ${decodeURIComponent(server)}`
    : SECTION_TITLES[section] || 'Report';

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">{venueName}</h1>
        <p className="text-sm text-muted-foreground">{formatDate(date)}</p>
        <p className="text-xs text-brass font-medium mt-1 uppercase tracking-wide">{sectionTitle}</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-3">
        {[
          { label: 'Net Sales', value: fmt(s.net_sales) },
          { label: 'Checks', value: num(s.total_checks) },
          { label: 'Covers', value: num(s.total_covers) },
          { label: 'Comp %', value: pct(compPct) },
        ].map(k => (
          <div key={k.label} className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
            <div className="text-sm font-semibold font-mono tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Action Center Items */}
      <ActionItemsPanel actions={actions} loading={actionsLoading} />

      {/* Section Content */}
      {section === 'comps' && <CompsSection report={report} reason={reason} />}
      {section === 'servers' && <ServersSection report={report} serverName={server} />}
      {section === 'items' && <ItemsSection report={report} />}
      {section === 'labor' && <LaborSection labor={labor} report={report} />}
      {section === 'categories' && <CategoriesSection report={report} />}

      {/* Footer */}
      <div className="pt-4 border-t">
        <Link
          href={`/reports/nightly?date=${date}&venue=${venueId}&section=${section}`}
          className="block text-center text-sm text-brass hover:underline"
        >
          View Full Report &rarr;
        </Link>
      </div>
    </div>
  );
}

// ── Comps Section ─────────────────────────────────────────────────

function CompsSection({ report, reason }: { report: ReportData; reason: string }) {
  const decodedReason = reason ? decodeURIComponent(reason) : '';

  // Filtered detailed comps
  const details = decodedReason
    ? report.detailedComps.filter(c => c.reason?.toLowerCase() === decodedReason.toLowerCase())
    : report.detailedComps;

  const totalAmt = details.reduce((sum, c) => sum + c.comp_total, 0);

  return (
    <div className="space-y-4">
      {/* By-reason summary (only when not filtered to a single reason) */}
      {!decodedReason && report.discounts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-keva text-xs">
            <thead>
              <tr><th>Reason</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr>
            </thead>
            <tbody>
              {report.discounts
                .sort((a, b) => b.amount - a.amount)
                .map(d => (
                  <tr key={d.reason}>
                    <td>{d.reason}</td>
                    <td className="text-right">{d.qty}</td>
                    <td className="text-right">{fmt(d.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filtered summary */}
      {decodedReason && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <span className="font-medium">{details.length}</span> check{details.length !== 1 ? 's' : ''} totaling <span className="font-semibold">{fmt(totalAmt)}</span>
        </div>
      )}

      {/* Detailed comps */}
      {details.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-keva text-xs">
            <thead>
              <tr>
                <th>Table</th><th>Server</th>
                {!decodedReason && <th>Reason</th>}
                <th className="text-right">Comp</th><th className="text-right">Check</th>
              </tr>
            </thead>
            <tbody>
              {details.map((c, i) => (
                <tr key={`${c.check_id}-${i}`}>
                  <td>{c.table_name || '—'}</td>
                  <td>{c.server}</td>
                  {!decodedReason && <td>{c.reason}</td>}
                  <td className="text-right">{fmt(c.comp_total)}</td>
                  <td className="text-right">{fmt(c.check_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {details.some(c => c.comped_items?.length > 0) && (
            <div className="mt-3 space-y-2">
              {details.filter(c => c.comped_items?.length > 0).map((c, i) => (
                <div key={`items-${i}`} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.server}</span> ({c.table_name}): {c.comped_items.join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {details.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No comp details available</p>
      )}
    </div>
  );
}

// ── Servers Section ───────────────────────────────────────────────

function ServersSection({ report, serverName }: { report: ReportData; serverName: string }) {
  const decodedName = serverName ? decodeURIComponent(serverName) : '';
  const servers = decodedName
    ? report.servers.filter(s => s.employee_name?.toLowerCase() === decodedName.toLowerCase())
    : report.servers.sort((a, b) => b.net_sales - a.net_sales);

  // Single server detail view
  if (decodedName && servers.length === 1) {
    const sv = servers[0];
    const serverComps = report.detailedComps.filter(
      c => c.server?.toLowerCase() === decodedName.toLowerCase()
    );
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Role', value: sv.employee_role_name || 'Server' },
            { label: 'Tickets', value: num(sv.tickets) },
            { label: 'Covers', value: num(sv.covers) },
            { label: 'Net Sales', value: fmt(sv.net_sales) },
            { label: 'Avg Ticket', value: fmtDec(sv.avg_ticket) },
            { label: 'Tip %', value: pct(sv.tip_pct) },
          ].map(k => (
            <div key={k.label} className="rounded-lg bg-muted/50 p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
              <div className="text-sm font-semibold font-mono">{k.value}</div>
            </div>
          ))}
        </div>
        {serverComps.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Comps ({serverComps.length})</h3>
            <div className="overflow-x-auto">
              <table className="table-keva text-xs">
                <thead><tr><th>Table</th><th>Reason</th><th className="text-right">Comp</th></tr></thead>
                <tbody>
                  {serverComps.map((c, i) => (
                    <tr key={i}><td>{c.table_name || '—'}</td><td>{c.reason}</td><td className="text-right">{fmt(c.comp_total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full server table
  return (
    <div className="overflow-x-auto">
      <table className="table-keva text-xs">
        <thead>
          <tr><th>Server</th><th className="text-right">Covers</th><th className="text-right">Sales</th><th className="text-right">Avg/Cover</th><th className="text-right">Tip %</th></tr>
        </thead>
        <tbody>
          {servers.map(sv => (
            <tr key={sv.employee_name}>
              <td className="font-medium">{sv.employee_name}</td>
              <td className="text-right">{sv.covers}</td>
              <td className="text-right">{fmt(sv.net_sales)}</td>
              <td className="text-right">{sv.covers > 0 ? fmtDec(sv.net_sales / sv.covers) : '—'}</td>
              <td className="text-right">{pct(sv.tip_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Items Section ─────────────────────────────────────────────────

function ItemsSection({ report }: { report: ReportData }) {
  const items = [...report.menuItems].sort((a, b) => b.net_total - a.net_total);

  return (
    <div className="overflow-x-auto">
      <table className="table-keva text-xs">
        <thead>
          <tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.name}-${i}`}>
              <td>
                <div className="font-medium">{item.name}</div>
                <div className="text-[10px] text-muted-foreground">{item.parent_category}</div>
              </td>
              <td className="text-right">{item.qty}</td>
              <td className="text-right">{fmt(item.net_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Labor Section ─────────────────────────────────────────────────

function LaborSection({ labor, report }: { labor: LaborData | null; report: ReportData }) {
  if (!labor) {
    return <p className="text-sm text-muted-foreground text-center py-6">No labor data available</p>;
  }

  const splh = labor.total_hours > 0 ? report.summary.net_sales / labor.total_hours : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Labor Cost', value: fmt(labor.labor_cost) },
          { label: 'Labor %', value: pct(labor.labor_pct) },
          { label: 'Total Hours', value: labor.total_hours.toFixed(1) },
          { label: 'Employees', value: num(labor.employee_count) },
          { label: 'SPLH', value: fmt(splh) },
        ].map(k => (
          <div key={k.label} className="rounded-lg bg-muted/50 p-2.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
            <div className="text-sm font-semibold font-mono">{k.value}</div>
          </div>
        ))}
      </div>

      {(labor.foh || labor.boh) && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="table-keva text-xs">
              <thead><tr><th>Dept</th><th className="text-right">Cost</th><th className="text-right">Hours</th><th className="text-right">Staff</th></tr></thead>
              <tbody>
                {labor.foh && (
                  <tr><td>FOH</td><td className="text-right">{fmt(labor.foh.cost)}</td><td className="text-right">{labor.foh.hours.toFixed(1)}</td><td className="text-right">{labor.foh.employee_count}</td></tr>
                )}
                {labor.boh && (
                  <tr><td>BOH</td><td className="text-right">{fmt(labor.boh.cost)}</td><td className="text-right">{labor.boh.hours.toFixed(1)}</td><td className="text-right">{labor.boh.employee_count}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Categories Section ────────────────────────────────────────────

function CategoriesSection({ report }: { report: ReportData }) {
  const cats = [...report.salesByCategory].sort((a, b) => b.net_sales - a.net_sales);
  const totalNet = cats.reduce((sum, c) => sum + c.net_sales, 0);

  return (
    <div className="overflow-x-auto">
      <table className="table-keva text-xs">
        <thead>
          <tr><th>Category</th><th className="text-right">Net Sales</th><th className="text-right">% Mix</th></tr>
        </thead>
        <tbody>
          {cats.map(c => (
            <tr key={c.category}>
              <td className="font-medium">{c.category}</td>
              <td className="text-right">{fmt(c.net_sales)}</td>
              <td className="text-right">{totalNet > 0 ? pct((c.net_sales / totalNet) * 100) : '—'}</td>
            </tr>
          ))}
          <tr className="font-semibold border-t-2 border-brass">
            <td>Total</td>
            <td className="text-right">{fmt(totalNet)}</td>
            <td className="text-right">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
