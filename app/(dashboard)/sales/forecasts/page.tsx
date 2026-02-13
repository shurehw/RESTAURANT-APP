export const dynamic = 'force-dynamic';

/**
 * Demand Forecasts Dashboard
 * Shows AI predictions for covers AND sales with 4-layer bias corrections
 * Includes layer breakdown and manager override capability
 */

import { createClient } from '@/lib/supabase/server';
import { ForecastChart } from '@/components/labor/ForecastChart';
import { ForecastFilters } from '@/components/labor/ForecastFilters';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, Users, Calendar } from 'lucide-react';
import { ForecastTable } from './ForecastTable';

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

  // Get forecasts from bias-corrected view (4-layer pipeline)
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { data: forecasts } = await supabase
    .from('forecasts_with_bias')
    .select('*')
    .eq('venue_id', selectedVenue ?? '')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('business_date');

  // Get existing overrides for this range
  const { data: overrides } = await supabase
    .from('forecast_overrides')
    .select('business_date, shift_type, forecast_post_override, reason_code, delta')
    .eq('venue_id', selectedVenue ?? '')
    .gte('business_date', startDate)
    .lte('business_date', endDate);

  const overrideMap = new Map(
    (overrides || []).map(o => [`${o.business_date}|${o.shift_type}`, o])
  );

  // Calculate summary stats (using bias-corrected values)
  const totalCovers = forecasts?.reduce((sum, f) => sum + (f.covers_predicted || 0), 0) || 0;
  const totalRevenue = forecasts?.reduce((sum, f) => sum + (f.revenue_predicted || 0), 0) || 0;
  const avgCheck = totalCovers > 0 ? totalRevenue / totalCovers : 0;
  const avgAccuracy = forecasts?.length
    ? forecasts.reduce((sum, f) => sum + (f.confidence_pct || 0), 0) / forecasts.length
    : 0;
  const hasBiasCorrections = forecasts?.some(f => f.bias_corrected) || false;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="page-header">Demand Forecasts</h1>
          {hasBiasCorrections && (
            <Badge variant="sage" className="text-xs">Bias-corrected</Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          AI predictions with day-type, holiday, and pacing adjustments
        </p>
      </div>

      {/* Filters */}
      <ForecastFilters
        venues={venues || []}
        selectedVenue={selectedVenue || ''}
        daysAhead={daysAhead}
      />

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
              <div className="text-sm text-muted-foreground">Track Record</div>
              <div className="text-2xl font-bold">{Math.round(avgAccuracy)}%</div>
              <div className="text-xs text-muted-foreground">Hit rate within 10%</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Chart */}
      {forecasts && forecasts.length > 0 ? (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold mb-4">Covers & Revenue Forecast</h3>
          <ForecastChart forecasts={forecasts as any} />
        </Card>
      ) : (
        <Card className="p-12 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="mb-2">No forecasts available</p>
          <p className="text-sm">Click &ldquo;Generate New Forecasts&rdquo; to run the AI forecaster</p>
        </Card>
      )}

      {/* Detailed Table with Override capability */}
      {forecasts && forecasts.length > 0 && (
        <ForecastTable
          forecasts={forecasts as any}
          overrideMap={Object.fromEntries(overrideMap) as any}
          venueId={selectedVenue || ''}
        />
      )}
    </div>
  );
}
