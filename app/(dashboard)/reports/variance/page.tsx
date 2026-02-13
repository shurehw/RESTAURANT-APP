export const dynamic = 'force-dynamic';

/**
 * Food Cost Variance Report
 * Shows theoretical vs actual food cost analysis
 */

import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Upload, Calendar } from 'lucide-react';

export default async function VarianceReportPage() {
  const supabase = await createClient();

  // Get last 30 days of variance data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const { data: varianceData } = await supabase
    .from('v_food_cost_variance')
    .select('*')
    .gte('date', thirtyDaysAgoStr)
    .order('date', { ascending: false })
    .limit(30);

  // Calculate summary stats
  const totalSales = varianceData?.reduce((sum, d) => sum + (d.total_sales || 0), 0) || 0;
  const totalTheoretical = varianceData?.reduce((sum, d) => sum + (d.theoretical_cost || 0), 0) || 0;
  const totalActual = varianceData?.reduce((sum, d) => sum + (d.actual_cost || 0), 0) || 0;
  const avgTheoreticalPct = totalSales > 0 ? (totalTheoretical / totalSales * 100) : 0;
  const avgActualPct = totalSales > 0 ? (totalActual / totalSales * 100) : 0;
  const varianceDollars = totalActual - totalTheoretical;
  const variancePct = totalTheoretical > 0 ? ((varianceDollars / totalTheoretical) * 100) : 0;

  // Check POS mapping status
  const { data: unmappedItems, count: unmappedCount } = await supabase
    .from('pos_items')
    .select('*', { count: 'exact', head: true })
    .eq('is_mapped', false);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Food Cost Variance</h1>
          <p className="text-muted-foreground">
            Theoretical vs Actual Analysis • Last 30 Days
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/reports/variance/import">
              <Upload className="w-4 h-4 mr-2" />
              Import POS Sales
            </a>
          </Button>
          <Button variant="brass" asChild>
            <a href="/reports/variance/map-items">
              Map POS Items {unmappedCount && unmappedCount > 0 && `(${unmappedCount})`}
            </a>
          </Button>
        </div>
      </div>

      {/* Warning if unmapped items */}
      {unmappedCount && unmappedCount > 0 && (
        <Card className="p-4 mb-6 bg-opsos-error-50 border-opsos-error-200">
          <div className="flex items-start gap-3">
            <div className="text-opsos-error-600 font-semibold">⚠</div>
            <div>
              <h4 className="font-semibold text-opsos-error-800">
                {unmappedCount} unmapped POS items
              </h4>
              <p className="text-sm text-opsos-error-700">
                Map these items to recipes for accurate theoretical calculations.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Total Sales</div>
          <div className="text-2xl font-bold font-mono">${totalSales.toFixed(0)}</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Theoretical Cost %</div>
          <div className="text-2xl font-bold font-mono text-opsos-sage-600">
            {avgTheoreticalPct.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ${totalTheoretical.toFixed(0)}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Actual Cost %</div>
          <div className={`text-2xl font-bold font-mono ${
            avgActualPct <= 35 ? 'text-opsos-sage-600' :
            avgActualPct <= 40 ? 'text-brass' :
            'text-opsos-error'
          }`}>
            {avgActualPct.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ${totalActual.toFixed(0)}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-1">Variance</div>
          <div className={`text-2xl font-bold font-mono ${
            varianceDollars < 0 ? 'text-opsos-sage-600' : 'text-opsos-error'
          }`}>
            {varianceDollars >= 0 ? '+' : ''}{variancePct.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ${Math.abs(varianceDollars).toFixed(0)} {varianceDollars >= 0 ? 'over' : 'under'}
          </div>
        </Card>
      </div>

      {/* Daily Variance Table */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Daily Breakdown</h3>

        {!varianceData || varianceData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="mb-2">No variance data available</p>
            <p className="text-sm">Import POS sales data to see theoretical vs actual analysis</p>
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
                  const variancePct = theoreticalCost > 0
                    ? ((variance / theoreticalCost) * 100)
                    : 0;

                  return (
                    <tr key={row.date} className="border-b hover:bg-muted/50">
                      <td className="py-3">
                        {new Date(row.date || '').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 text-right font-mono">
                        ${(row.total_sales || 0).toFixed(0)}
                      </td>
                      <td className="py-3 text-right font-mono">
                        ${(row.theoretical_cost || 0).toFixed(0)}
                      </td>
                      <td className="py-3 text-right font-mono">
                        ${(row.actual_cost || 0).toFixed(0)}
                      </td>
                      <td className="py-3 text-right font-mono text-opsos-sage-600">
                        {(row.theoretical_food_cost_pct || 0).toFixed(1)}%
                      </td>
                      <td className={`py-3 text-right font-mono ${
                        (row.actual_food_cost_pct || 0) <= 35 ? 'text-opsos-sage-600' :
                        (row.actual_food_cost_pct || 0) <= 40 ? 'text-brass' :
                        'text-opsos-error'
                      }`}>
                        {(row.actual_food_cost_pct || 0).toFixed(1)}%
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {variance >= 0 ? (
                            <TrendingUp className="w-4 h-4 text-opsos-error" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-opsos-sage-600" />
                          )}
                          <span className={`font-mono ${
                            variance >= 0 ? 'text-opsos-error' : 'text-opsos-sage-600'
                          }`}>
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
    </div>
  );
}
