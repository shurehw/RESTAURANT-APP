/**
 * Nightly Report Page
 * Shows end-of-day operational data from TipSee POS
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import {
  Calendar,
  DollarSign,
  Users,
  Receipt,
  TrendingUp,
  Percent,
  Gift,
  Star,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UtensilsCrossed,
} from 'lucide-react';

interface NightlyReportData {
  date: string;
  summary: {
    trading_day: string;
    total_checks: number;
    total_covers: number;
    net_sales: number;
    sub_total: number;
    total_tax: number;
    total_comps: number;
    total_voids: number;
  };
  salesByCategory: Array<{
    category: string;
    net_sales: number;
    comps: number;
    voids: number;
  }>;
  servers: Array<{
    employee_name: string;
    employee_role_name: string;
    tickets: number;
    covers: number;
    net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
  }>;
  menuItems: Array<{
    name: string;
    qty: number;
    net_total: number;
  }>;
  discounts: Array<{
    reason: string;
    qty: number;
    amount: number;
  }>;
  detailedComps: Array<{
    check_id: string;
    table_name: string;
    server: string;
    comp_total: number;
    check_total: number;
    reason: string;
    comped_items: string[];
  }>;
  notableGuests: Array<{
    check_id: string;
    server: string;
    covers: number;
    payment: number;
    table_name: string;
    cardholder_name: string | null;
    tip_amount: number | null;
    tip_percent: number | null;
    items: string[];
    additional_items: number;
  }>;
  peopleWeKnow: Array<{
    first_name: string;
    last_name: string;
    is_vip: boolean;
    tags: string[] | null;
    party_size: number;
    total_payment: number;
    status: string;
  }>;
}

// Map OpsOS venue names to TipSee location UUIDs
const VENUE_TO_TIPSEE_MAP: Record<string, string> = {
  'The Nice Guy': 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4',
  // Add more mappings as needed
};

const DEFAULT_TIPSEE_LOCATION = 'aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function NightlyReportPage() {
  const { selectedVenue } = useVenue();
  const [date, setDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [report, setReport] = useState<NightlyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get TipSee location UUID from selected venue
  const locationUuid = selectedVenue?.name
    ? VENUE_TO_TIPSEE_MAP[selectedVenue.name] || DEFAULT_TIPSEE_LOCATION
    : DEFAULT_TIPSEE_LOCATION;

  // Fetch report when date or location changes
  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/nightly?date=${date}&location=${locationUuid}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to fetch report');
        }
        const data = await res.json();
        setReport(data);
      } catch (err: any) {
        setError(err.message);
        setReport(null);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [date, locationUuid]);

  function changeDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="page-header">Nightly Report</h1>
          <p className="text-muted-foreground">
            End-of-day operational summary from TipSee POS
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Navigation */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-md p-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => changeDate(-1)}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none text-sm font-medium px-2 focus:outline-none"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => changeDate(1)}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Venue Switcher */}
      <VenueQuickSwitcher />

      {/* Date Banner */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span className="font-medium">{formatDate(date)}</span>
      </div>

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

      {/* Report Content */}
      {!loading && !error && report && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard
              label="Net Sales"
              value={formatCurrency(report.summary.net_sales || 0)}
              icon={<DollarSign className="h-5 w-5 text-brass" />}
            />
            <StatCard
              label="Covers"
              value={formatNumber(report.summary.total_covers || 0)}
              icon={<Users className="h-5 w-5 text-sage" />}
            />
            <StatCard
              label="Checks"
              value={formatNumber(report.summary.total_checks || 0)}
              icon={<Receipt className="h-5 w-5 text-brass" />}
            />
            <StatCard
              label="Avg Check"
              value={formatCurrency(
                report.summary.total_checks > 0
                  ? report.summary.net_sales / report.summary.total_checks
                  : 0
              )}
              icon={<TrendingUp className="h-5 w-5 text-sage" />}
            />
            <StatCard
              label="Comps"
              value={formatCurrency(report.summary.total_comps || 0)}
              icon={<Gift className="h-5 w-5 text-error" />}
            />
            <StatCard
              label="Tax"
              value={formatCurrency(report.summary.total_tax || 0)}
              icon={<Percent className="h-5 w-5 text-muted-foreground" />}
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales by Category */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-brass" />
                  Sales by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {report.salesByCategory.length > 0 ? (
                  <table className="table-opsos">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="text-right">Net Sales</th>
                        <th className="text-right">Comps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.salesByCategory.map((cat, i) => (
                        <tr key={i}>
                          <td className="font-medium">{cat.category}</td>
                          <td className="text-right">{formatCurrency(cat.net_sales || 0)}</td>
                          <td className="text-right text-error">
                            {cat.comps > 0 ? formatCurrency(cat.comps) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No sales data</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Server Performance */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-sage" />
                  Server Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {report.servers.length > 0 ? (
                  <table className="table-opsos">
                    <thead>
                      <tr>
                        <th>Server</th>
                        <th className="text-right">Tickets</th>
                        <th className="text-right">Covers</th>
                        <th className="text-right">Sales</th>
                        <th className="text-right">Avg/Cover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.servers.slice(0, 10).map((server, i) => (
                        <tr key={i}>
                          <td>
                            <div className="font-medium">{server.employee_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {server.employee_role_name}
                            </div>
                          </td>
                          <td className="text-right">{server.tickets}</td>
                          <td className="text-right">{server.covers}</td>
                          <td className="text-right">{formatCurrency(server.net_sales || 0)}</td>
                          <td className="text-right">{formatCurrency(server.avg_per_cover || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No server data</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Menu Items */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-brass" />
                  Top Menu Items
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {report.menuItems.length > 0 ? (
                  <table className="table-opsos">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.menuItems.map((item, i) => (
                        <tr key={i}>
                          <td className="font-medium">{item.name}</td>
                          <td className="text-right">{formatNumber(item.qty || 0)}</td>
                          <td className="text-right">{formatCurrency(item.net_total || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No menu items</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comps & Discounts */}
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-5 w-5 text-error" />
                  Comps & Discounts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {report.discounts.length > 0 ? (
                  <table className="table-opsos">
                    <thead>
                      <tr>
                        <th>Reason</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.discounts.map((disc, i) => (
                        <tr key={i}>
                          <td className="font-medium">{disc.reason}</td>
                          <td className="text-right">{disc.qty}</td>
                          <td className="text-right text-error">{formatCurrency(disc.amount || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state py-8">
                    <p className="text-muted-foreground">No comps</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notable Guests */}
          <Card>
            <CardHeader className="border-b border-brass/20">
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-brass" />
                Notable Guests (Top Spenders)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {report.notableGuests.length > 0 ? (
                <div className="divide-y divide-border">
                  {report.notableGuests.map((guest, i) => (
                    <div key={i} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-semibold text-lg">
                            {formatCurrency(guest.payment || 0)}
                          </span>
                          <span className="text-muted-foreground text-sm ml-2">
                            Table {guest.table_name}
                          </span>
                        </div>
                        <div className="text-right">
                          {guest.cardholder_name && (
                            <div className="font-medium">{guest.cardholder_name}</div>
                          )}
                          {guest.tip_percent !== null && (
                            <div className="text-sm text-sage">
                              {guest.tip_percent}% tip
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span>Server: {guest.server}</span>
                        <span className="mx-2">|</span>
                        <span>{guest.covers} covers</span>
                      </div>
                      {guest.items.length > 0 && (
                        <div className="mt-2 text-sm">
                          {guest.items.join(', ')}
                          {guest.additional_items > 0 && (
                            <span className="text-muted-foreground">
                              {' '}+{guest.additional_items} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state py-8">
                  <p className="text-muted-foreground">No guest data</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* People We Know (VIPs) */}
          {report.peopleWeKnow.length > 0 && (
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-sage" />
                  People We Know
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="table-opsos">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Party</th>
                      <th className="text-right">Spent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.peopleWeKnow.map((person, i) => (
                      <tr key={i}>
                        <td>
                          <div className="flex items-center gap-2">
                            {person.is_vip && (
                              <span className="badge-brass">VIP</span>
                            )}
                            <span className="font-medium">
                              {person.first_name} {person.last_name}
                            </span>
                          </div>
                          {person.tags && person.tags.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {person.tags.join(', ')}
                            </div>
                          )}
                        </td>
                        <td>{person.party_size}</td>
                        <td className="text-right">
                          {formatCurrency(person.total_payment || 0)}
                        </td>
                        <td>
                          <span className="badge-sage">{person.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Detailed Comps */}
          {report.detailedComps.length > 0 && (
            <Card>
              <CardHeader className="border-b border-brass/20">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-5 w-5 text-error" />
                  Detailed Comp Report
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {report.detailedComps.map((comp, i) => (
                    <div key={i} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-semibold text-error">
                            {formatCurrency(comp.comp_total || 0)} comped
                          </span>
                          <span className="text-muted-foreground text-sm ml-2">
                            of {formatCurrency(comp.check_total || 0)} total
                          </span>
                        </div>
                        <span className="badge-error">{comp.reason}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Table {comp.table_name} | Server: {comp.server}
                      </div>
                      {comp.comped_items.length > 0 && (
                        <div className="mt-2 text-sm">
                          {comp.comped_items.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-muted">{icon}</div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
        </div>
      </div>
    </Card>
  );
}
