export const dynamic = 'force-dynamic';

/**
 * Cost Reports Hub
 * Tabs: Budget, Savings, Variance
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { HubTabBar } from '@/components/ui/HubTabBar';
import { Card } from '@/components/ui/card';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { BudgetChart } from '@/components/budget/BudgetChart';
import { BudgetFilters } from '@/components/budget/BudgetFilters';
import {
  TrendingUp, TrendingDown, DollarSign, Calendar, Package, Link2,
} from 'lucide-react';

const TABS = [
  { key: 'budget', label: 'Budget' },
  { key: 'savings', label: 'Savings' },
  { key: 'variance', label: 'Variance' },
];

export default async function CostReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab || 'budget';

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="page-header">Cost Reports</h1>
        <p className="text-muted-foreground">
          Budget tracking, savings analysis, and food cost variance
        </p>
      </div>

      <HubTabBar tabs={TABS} basePath="/cost-reports" defaultTab="budget" />

      <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading...</div>}>
        {tab === 'budget' && <BudgetTab />}
        {tab === 'savings' && <SavingsTab />}
        {tab === 'variance' && <VarianceTab />}
      </Suspense>
    </div>
  );
}

async function BudgetTab() {
  const supabase = await createClient();

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('period_start', '2024-01-01')
    .limit(1)
    .single();

  const chartData = [
    { day: 'Mon', budget: 10000, actual: 0, remaining: 10000 },
    { day: 'Tue', budget: 10000, actual: 1500, remaining: 8500 },
    { day: 'Wed', budget: 10000, actual: 3200, remaining: 6800 },
    { day: 'Thu', budget: 10000, actual: 4900, remaining: 5100 },
    { day: 'Fri', budget: 10000, actual: 7200, remaining: 2800 },
    { day: 'Sat', budget: 10000, actual: 9500, remaining: 500 },
    { day: 'Sun', budget: 10000, actual: 10200, remaining: -200 },
  ];

  const weeklyBudget = budgets?.initial_budget || 10000;
  const actualSpend = 10200;
  const remaining = weeklyBudget - actualSpend;
  const percentUsed = (actualSpend / weeklyBudget) * 100;
  const isOverBudget = remaining < 0;

  return (
    <>
      <BudgetFilters />
      <div className="grid grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader><CardTitle className="text-overline">Weekly Budget</CardTitle></CardHeader>
          <CardContent>
            <div className="stat-card-value">${weeklyBudget.toLocaleString()}</div>
            <div className="flex items-center gap-2 mt-2">
              <DollarSign className="w-4 h-4 text-brass" />
              <span className="text-caption text-muted-foreground">Food &amp; Bev</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-overline">Actual Spend</CardTitle></CardHeader>
          <CardContent>
            <div className="stat-card-value">${actualSpend.toLocaleString()}</div>
            <div className={`stat-card-change ${isOverBudget ? 'negative' : 'positive'} flex items-center gap-1 mt-2`}>
              {isOverBudget ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{percentUsed.toFixed(1)}% of budget</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-overline">Remaining</CardTitle></CardHeader>
          <CardContent>
            <div className={`stat-card-value ${isOverBudget ? 'text-error' : 'text-sage'}`}>
              {isOverBudget ? '-' : ''}${Math.abs(remaining).toLocaleString()}
            </div>
            <div className={`stat-card-change ${isOverBudget ? 'negative' : 'positive'} mt-2`}>
              {isOverBudget ? 'Over budget' : `${Math.abs((remaining / weeklyBudget) * 100).toFixed(1)}% left`}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Daily Budget Trend</CardTitle></CardHeader>
        <CardContent><BudgetChart data={chartData} /></CardContent>
      </Card>
    </>
  );
}

async function SavingsTab() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const { data: monthlySavings } = await (supabase as any)
    .from('monthly_savings_summary').select('*')
    .gte('month_start', monthStart).lte('month_start', monthEnd)
    .order('total_savings', { ascending: false });

  const { data: annualSavings } = await (supabase as any)
    .from('annual_savings_summary').select('*')
    .eq('year', now.getFullYear())
    .order('total_savings', { ascending: false });

  const { data: recentEvents } = await (supabase as any)
    .from('savings_events')
    .select('*, items(item_name), venues(name)')
    .order('event_date', { ascending: false }).limit(20);

  const monthlyTotal = monthlySavings?.reduce((sum: number, s: any) => sum + (s.total_savings || 0), 0) || 0;
  const annualTotal = annualSavings?.reduce((sum: number, s: any) => sum + (s.total_savings || 0), 0) || 0;
  const avgMonthlySavings = annualTotal / 12;

  const savingsByType = (annualSavings || []).reduce((acc: any, s: any) => {
    acc[s.savings_type] = (acc[s.savings_type] || 0) + (s.total_savings || 0);
    return acc;
  }, {});

  const savingsTypeLabels: { [key: string]: string } = {
    par_optimization: 'Par Optimization',
    waste_reduction: 'Waste Reduction',
    price_negotiation: 'Price Negotiation',
    portion_control: 'Portion Control',
    theft_prevention: 'Theft Prevention',
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div className="text-sm text-muted-foreground">This Month</div>
          </div>
          <div className="text-3xl font-bold text-green-600">${monthlyTotal.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {monthlySavings?.reduce((sum: number, s: any) => sum + (s.event_count || 0), 0) || 0} events
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
            <div className="text-sm text-muted-foreground">Year to Date</div>
          </div>
          <div className="text-3xl font-bold text-blue-600">${annualTotal.toFixed(0)}</div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg"><Calendar className="w-5 h-5 text-purple-600" /></div>
            <div className="text-sm text-muted-foreground">Avg Per Month</div>
          </div>
          <div className="text-3xl font-bold text-purple-600">${avgMonthlySavings.toFixed(0)}</div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg"><Package className="w-5 h-5 text-yellow-600" /></div>
            <div className="text-sm text-muted-foreground">Annual Projection</div>
          </div>
          <div className="text-3xl font-bold text-yellow-600">${(avgMonthlySavings * 12).toFixed(0)}</div>
        </Card>
      </div>

      {Object.keys(savingsByType).length > 0 && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Year-to-Date Savings by Type</h2>
          <div className="space-y-3">
            {Object.entries(savingsByType).map(([type, amount]: [string, any]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Badge variant="outline">{savingsTypeLabels[type] || type}</Badge>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${(amount / annualTotal) * 100}%` }} />
                  </div>
                </div>
                <div className="text-lg font-bold text-green-600 ml-4">${amount.toFixed(0)}</div>
                <div className="text-sm text-muted-foreground ml-3 w-16 text-right">
                  {((amount / annualTotal) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Savings Events</h2>
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Savings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!recentEvents || recentEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No savings events recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                recentEvents.map((event: any) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm">{new Date(event.event_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{savingsTypeLabels[event.savings_type] || event.savings_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{(event.items as any)?.item_name || '—'}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{event.description}</TableCell>
                    <TableCell className="text-right text-sm">{event.quantity ? event.quantity.toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">${event.savings_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}

async function VarianceTab() {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const { data: varianceData } = await supabase
    .from('v_food_cost_variance').select('*')
    .gte('date', thirtyDaysAgoStr)
    .order('date', { ascending: false }).limit(30);

  const totalSales = varianceData?.reduce((sum, d) => sum + (d.total_sales || 0), 0) || 0;
  const totalTheoretical = varianceData?.reduce((sum, d) => sum + (d.theoretical_cost || 0), 0) || 0;
  const totalActual = varianceData?.reduce((sum, d) => sum + (d.actual_cost || 0), 0) || 0;
  const avgTheoreticalPct = totalSales > 0 ? (totalTheoretical / totalSales * 100) : 0;
  const avgActualPct = totalSales > 0 ? (totalActual / totalSales * 100) : 0;
  const varianceDollars = totalActual - totalTheoretical;
  const variancePctTotal = totalTheoretical > 0 ? ((varianceDollars / totalTheoretical) * 100) : 0;

  const { data: coverageRows } = await supabase.from('v_menu_item_mapping_coverage').select('*');
  const totalItems = coverageRows?.reduce((sum, r) => sum + (r.total_items || 0), 0) || 0;
  const unmappedItems = coverageRows?.reduce((sum, r) => sum + (r.unmapped_items || 0), 0) || 0;
  const totalCoveredSales = coverageRows?.reduce((sum, r) => sum + (r.mapped_sales || 0), 0) || 0;
  const totalCoverageSales = coverageRows?.reduce((sum, r) => sum + (r.total_sales || 0), 0) || 0;
  const salesCoveragePct = totalCoverageSales > 0 ? Math.round((totalCoveredSales / totalCoverageSales) * 100) : 0;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button variant="brass" asChild>
          <a href="/reports/variance/map-items">
            <Link2 className="w-4 h-4 mr-2" />
            Map Menu Items {unmappedItems > 0 && `(${unmappedItems})`}
          </a>
        </Button>
      </div>

      {totalItems > 0 && unmappedItems > 0 && (
        <Card className="p-4 mb-6 bg-keva-error-50 border-keva-error-200">
          <h4 className="font-semibold text-keva-error-800">
            {unmappedItems} of {totalItems} menu items unmapped
          </h4>
          <p className="text-sm text-keva-error-700">
            {salesCoveragePct}% of sales revenue is covered. Map remaining items for more accurate theoretical COGS.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Total Sales</div>
          <div className="text-2xl font-bold font-mono">${totalSales.toFixed(0)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Theoretical Cost %</div>
          <div className="text-2xl font-bold font-mono text-keva-sage-600">{avgTheoreticalPct.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground mt-1">${totalTheoretical.toFixed(0)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Actual Cost %</div>
          <div className={`text-2xl font-bold font-mono ${avgActualPct <= 35 ? 'text-keva-sage-600' : avgActualPct <= 40 ? 'text-brass' : 'text-keva-error'}`}>
            {avgActualPct.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">${totalActual.toFixed(0)}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Variance</div>
          <div className={`text-2xl font-bold font-mono ${varianceDollars < 0 ? 'text-keva-sage-600' : 'text-keva-error'}`}>
            {varianceDollars >= 0 ? '+' : ''}{variancePctTotal.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ${Math.abs(varianceDollars).toFixed(0)} {varianceDollars >= 0 ? 'over' : 'under'}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Daily Breakdown</h3>
        {!varianceData || varianceData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No variance data available</p>
            <p className="text-sm mt-1">Map menu items to recipes to see theoretical vs actual analysis.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-sm text-muted-foreground border-b">
                <tr>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium text-right">Sales</th>
                  <th className="pb-3 font-medium text-right">Theoretical</th>
                  <th className="pb-3 font-medium text-right">Actual</th>
                  <th className="pb-3 font-medium text-right">Theo %</th>
                  <th className="pb-3 font-medium text-right">Actual %</th>
                  <th className="pb-3 font-medium text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {varianceData.map((row) => {
                  const variance = (row.actual_cost || 0) - (row.theoretical_cost || 0);
                  const theoreticalCost = row.theoretical_cost || 0;
                  const variancePct = theoreticalCost > 0 ? ((variance / theoreticalCost) * 100) : 0;
                  return (
                    <tr key={row.date} className="border-b hover:bg-muted/50">
                      <td className="py-3">{new Date(row.date || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="py-3 text-right font-mono">${(row.total_sales || 0).toFixed(0)}</td>
                      <td className="py-3 text-right font-mono">${(row.theoretical_cost || 0).toFixed(0)}</td>
                      <td className="py-3 text-right font-mono">${(row.actual_cost || 0).toFixed(0)}</td>
                      <td className="py-3 text-right font-mono text-keva-sage-600">{(row.theoretical_food_cost_pct || 0).toFixed(1)}%</td>
                      <td className={`py-3 text-right font-mono ${(row.actual_food_cost_pct || 0) <= 35 ? 'text-keva-sage-600' : (row.actual_food_cost_pct || 0) <= 40 ? 'text-brass' : 'text-keva-error'}`}>
                        {(row.actual_food_cost_pct || 0).toFixed(1)}%
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {variance >= 0 ? <TrendingUp className="w-4 h-4 text-keva-error" /> : <TrendingDown className="w-4 h-4 text-keva-sage-600" />}
                          <span className={`font-mono ${variance >= 0 ? 'text-keva-error' : 'text-keva-sage-600'}`}>
                            {variance >= 0 ? '+' : ''}{variancePct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
