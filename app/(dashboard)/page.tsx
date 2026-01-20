/**
 * app/page.tsx
 * Dashboard home page with key metrics.
 */

import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { ContextBand } from "@/components/ui/ContextBand";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch key metrics
  const [
    { count: invoiceCount },
    { count: pendingInvoices },
    { count: alertCount },
    { data: venues }
  ] = await Promise.all([
    supabase.from('invoices').select('*', { count: 'exact', head: true }),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('alert_events').select('*', { count: 'exact', head: true }).eq('acknowledged', false),
    supabase.from('venues').select('id, name').eq('is_active', true)
  ]);

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

      {/* Venues */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Venues</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues?.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
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

async function VenueCard({ venue }: { venue: { id: string; name: string } }) {
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

  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="text-lg font-semibold mb-3">{venue.name}</h3>
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
    </div>
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
