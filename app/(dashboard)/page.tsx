export const dynamic = 'force-dynamic';

/**
 * app/page.tsx
 * Dashboard home page with key metrics.
 */

import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { ContextBand } from "@/components/ui/ContextBand";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch key metrics + health scores
  const [
    { count: invoiceCount },
    { count: pendingInvoices },
    { count: alertCount },
    { data: venues },
    { data: healthRows }
  ] = await Promise.all([
    supabase.from('invoices').select('*', { count: 'exact', head: true }),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('alert_events').select('*', { count: 'exact', head: true }).eq('acknowledged', false),
    supabase.from('venues').select('id, name').eq('is_active', true),
    supabase.from('v_venue_health_current').select('venue_id, health_score, status, confidence, signal_count, top_drivers, open_actions, date')
  ]);

  // Build health lookup by venue_id
  const healthMap = new Map<string, VenueHealth>();
  for (const row of healthRows || []) {
    healthMap.set(row.venue_id, row);
  }

  return (
    <div>
      <ContextBand
        date={new Date().toISOString()}
      />

      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of restaurant operations across all venues
          </p>
        </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="Total Invoices"
          value={invoiceCount || 0}
          subtitle="All time"
        />
        <MetricCard
          title="Pending Approval"
          value={pendingInvoices || 0}
          subtitle="Requires action"
          alert={!!(pendingInvoices && pendingInvoices > 0)}
        />
        <MetricCard
          title="Active Alerts"
          value={alertCount || 0}
          subtitle="Unacknowledged"
          alert={!!(alertCount && alertCount > 0)}
        />
      </div>

      {/* Health Summary */}
      {healthRows && healthRows.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm font-medium text-muted-foreground">Venue Health:</span>
          <HealthSummaryBadges health={healthRows} />
        </div>
      )}

      {/* Venues */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Venues</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues?.map((venue) => (
            <VenueCard key={venue.id} venue={venue} health={healthMap.get(venue.id)} />
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink href="/invoices" title="Review Invoices" />
        <QuickLink href="/items" title="Manage Items" />
        <QuickLink href="/inventory" title="Inventory Counts" />
        <QuickLink href="/recipes" title="Recipe Costing" />
      </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  alert = false
}: {
  title: string;
  value: number | string;
  subtitle: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-card p-6 ${alert ? 'border-destructive' : ''}`}>
      <h3 className="text-sm font-medium text-muted-foreground mb-1">{title}</h3>
      <p className={`text-3xl font-bold mb-1 ${alert ? 'text-destructive' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

interface VenueHealth {
  venue_id: string;
  health_score: number;
  status: string;
  confidence: number;
  signal_count: number;
  top_drivers: Array<{ signal: string; risk: number; weight: number; impact: number; reason: string }> | null;
  open_actions: number;
  date: string;
}

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  GREEN:  { dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
  YELLOW: { dot: 'bg-amber-500',   bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200' },
  ORANGE: { dot: 'bg-orange-500',  bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200' },
  RED:    { dot: 'bg-red-500',     bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200' },
};

function HealthSummaryBadges({ health }: { health: VenueHealth[] }) {
  const counts: Record<string, number> = {};
  for (const h of health) {
    counts[h.status] = (counts[h.status] || 0) + 1;
  }

  return (
    <div className="flex items-center gap-2">
      {(['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const).map(status => {
        const count = counts[status];
        if (!count) return null;
        const s = STATUS_STYLES[status];
        return (
          <span key={status} className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {count}
          </span>
        );
      })}
    </div>
  );
}

async function VenueCard({ venue, health }: { venue: { id: string; name: string }; health?: VenueHealth }) {
  const supabase = await createClient();

  // Fetch venue-specific stats
  const [
    { data: budgets },
    { count: inventoryCounts }
  ] = await Promise.all([
    supabase
      .from('v_declining_budget')
      .select('remaining_budget')
      .eq('venue_id', venue.id)
      .order('txn_date', { ascending: false })
      .limit(1),
    supabase
      .from('inventory_counts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('count_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  ]);

  const remainingBudget = budgets?.[0]?.remaining_budget || 0;
  const s = health ? STATUS_STYLES[health.status] || STATUS_STYLES.GREEN : null;

  return (
    <div className={`rounded-lg border bg-card p-6 ${s ? s.border : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{venue.name}</h3>
        {health && s && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold ${s.bg} ${s.text}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
            {Math.round(health.health_score)}
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Remaining Budget:</span>
          <span className="font-medium">{formatCurrency(remainingBudget)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Open Counts:</span>
          <span className="font-medium">{inventoryCounts || 0}</span>
        </div>
      </div>

      {/* Signal drivers */}
      {health?.top_drivers && health.top_drivers.length > 0 && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5">
          {health.top_drivers.map((d) => (
            <SignalPill key={d.signal} signal={d.signal} risk={d.risk} />
          ))}
          {health.open_actions > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
              {health.open_actions} action{health.open_actions !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SignalPill({ signal, risk }: { signal: string; risk: number }) {
  // Color based on individual signal risk (0 = fine, 1 = bad)
  const color = risk === 0
    ? 'bg-emerald-50 text-emerald-600'
    : risk < 0.3
    ? 'bg-emerald-50 text-emerald-700'
    : risk < 0.6
    ? 'bg-amber-50 text-amber-700'
    : 'bg-red-50 text-red-700';

  const label = signal.charAt(0).toUpperCase() + signal.slice(1);

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function QuickLink({ href, title }: { href: string; title: string }) {
  return (
    <a
      href={href}
      className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
    >
      <h4 className="font-medium">{title}</h4>
      <p className="text-sm text-muted-foreground mt-1">Quick access →</p>
    </a>
  );
}
