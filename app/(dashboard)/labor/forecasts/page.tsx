export const dynamic = 'force-dynamic';

/**
 * Demand Forecasts Dashboard
 * Shows AI predictions for BOTH covers AND sales (revenue)
 */

import { createClient } from '@/lib/supabase/server';
import { ForecastChart } from '@/components/labor/ForecastChart';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, DollarSign, Users, Calendar } from 'lucide-react';

export default async function ForecastsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; days?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Get venues
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true);

  const selectedVenue = params.venue || venues?.[0]?.id;
  const daysAhead = parseInt(params.days || '7');

  // Get forecasts
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: forecasts } = await supabase
    .from('demand_forecasts')
    .select('*')
    .eq('venue_id', selectedVenue)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date');

  // Calculate summary stats
  const totalCovers = forecasts?.reduce((sum, f) => sum + (f.covers_predicted || 0), 0) || 0;
  const totalRevenue = forecasts?.reduce((sum, f) => sum + (f.revenue_predicted || 0), 0) || 0;
  const avgCheck = totalRevenue / totalCovers || 0;
  const avgConfidence = forecasts?.reduce((sum, f) => sum + (f.confidence_level || 0), 0) / (forecasts?.length || 1) || 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-header">Demand Forecasts</h1>
        <p className="text-muted-foreground">
          AI predictions for covers and sales (revenue)
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Venue:</label>
          <select
            className="px-3 py-2 border rounded-md"
            value={selectedVenue}
            onChange={(e) => {
              window.location.href = `/labor/forecasts?venue=${e.target.value}&days=${daysAhead}`;
            }}
          >
            {venues?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Days Ahead:</label>
          <select
            className="px-3 py-2 border rounded-md"
            value={daysAhead}
            onChange={(e) => {
              window.location.href = `/labor/forecasts?venue=${selectedVenue}&days=${e.target.value}`;
            }}
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        <Button variant="brass" className="ml-auto">
          <Calendar className="w-4 h-4 mr-2" />
          Generate New Forecasts
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-opsos-sage-600" />
            <div>
              <div className="text-sm text-muted-foreground">Total Covers</div>
              <div className="text-2xl font-bold">{totalCovers.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Next {daysAhead} days</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-brass" />
            <div>
              <div className="text-sm text-muted-foreground">Total Revenue</div>
              <div className="text-2xl font-bold">${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <div className="text-xs text-muted-foreground">Next {daysAhead} days</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-opsos-sage-600" />
            <div>
              <div className="text-sm text-muted-foreground">Avg Check</div>
              <div className="text-2xl font-bold">${avgCheck.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Per cover</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-brass" />
            <div>
              <div className="text-sm text-muted-foreground">Forecast Confidence</div>
              <div className="text-2xl font-bold">{(avgConfidence * 100).toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Average accuracy</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Chart */}
      {forecasts && forecasts.length > 0 ? (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-4">Covers & Revenue Forecast</h3>
          <ForecastChart forecasts={forecasts} />
        </Card>
      ) : (
        <Card className="p-12 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="mb-2">No forecasts available</p>
          <p className="text-sm">Click "Generate New Forecasts" to run the AI forecaster</p>
        </Card>
      )}

      {/* Detailed Table */}
      {forecasts && forecasts.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Daily Forecast Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Day</th>
                  <th className="pb-3 font-medium">Shift</th>
                  <th className="pb-3 font-medium text-right">Covers</th>
                  <th className="pb-3 font-medium text-right">Revenue</th>
                  <th className="pb-3 font-medium text-right">Avg Check</th>
                  <th className="pb-3 font-medium text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {forecasts.map((forecast: any) => {
                  const date = new Date(forecast.business_date);
                  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const avgCheck = forecast.revenue_predicted / forecast.covers_predicted;

                  return (
                    <tr key={forecast.id} className="hover:bg-muted/30">
                      <td className="py-3 text-sm">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 text-sm font-medium">{dayOfWeek}</td>
                      <td className="py-3 text-sm text-muted-foreground capitalize">
                        {forecast.shift_type}
                      </td>
                      <td className="py-3 text-sm text-right font-mono">
                        {forecast.covers_predicted}
                        <span className="text-xs text-muted-foreground ml-1">
                          ({forecast.covers_lower}-{forecast.covers_upper})
                        </span>
                      </td>
                      <td className="py-3 text-sm text-right font-mono">
                        ${forecast.revenue_predicted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 text-sm text-right font-mono">
                        ${avgCheck.toFixed(2)}
                      </td>
                      <td className="py-3 text-sm text-right">
                        <span className={`font-medium ${
                          forecast.confidence_level >= 0.85 ? 'text-opsos-sage-600' :
                          forecast.confidence_level >= 0.70 ? 'text-brass' :
                          'text-muted-foreground'
                        }`}>
                          {(forecast.confidence_level * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
