'use client';

/**
 * Simple dual-axis chart showing both Covers and Revenue forecasts
 */

interface Forecast {
  business_date: string;
  covers_predicted: number;
  covers_lower: number;
  covers_upper: number;
  revenue_predicted: number;
  shift_type: string;
}

interface ForecastChartProps {
  forecasts: Forecast[];
}

export function ForecastChart({ forecasts }: ForecastChartProps) {
  if (!forecasts || forecasts.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No data to display</div>;
  }

  // Calculate scales
  const maxCovers = Math.max(...forecasts.map(f => f.covers_upper));
  const maxRevenue = Math.max(...forecasts.map(f => f.revenue_predicted));

  const chartHeight = 300;
  const chartWidth = Math.min(1000, forecasts.length * 80);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Legend */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-opsos-sage-600 rounded"></div>
            <span>Covers</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-brass rounded"></div>
            <span>Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-opsos-sage-300"></div>
            <span className="text-xs text-muted-foreground">Confidence Interval</span>
          </div>
        </div>

        {/* Simple bar chart */}
        <div className="relative" style={{ height: chartHeight, minWidth: chartWidth }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-muted-foreground pr-2">
            <div className="text-right">{maxCovers}</div>
            <div className="text-right">{Math.round(maxCovers / 2)}</div>
            <div className="text-right">0</div>
          </div>

          {/* Chart area */}
          <div className="absolute left-16 right-0 top-0 bottom-8 border-l border-b border-muted">
            <div className="relative h-full flex items-end justify-around gap-2 px-4">
              {forecasts.map((forecast, index) => {
                const date = new Date(forecast.business_date);
                const coversHeight = (forecast.covers_predicted / maxCovers) * 100;
                const revenueHeight = (forecast.revenue_predicted / maxRevenue) * 100;
                const lowerHeight = (forecast.covers_lower / maxCovers) * 100;
                const upperHeight = (forecast.covers_upper / maxCovers) * 100;

                return (
                  <div key={index} className="flex-1 relative group">
                    {/* Confidence interval */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-1 bg-opsos-sage-200"
                      style={{
                        bottom: `${lowerHeight}%`,
                        height: `${upperHeight - lowerHeight}%`
                      }}
                    />

                    {/* Covers bar */}
                    <div
                      className="absolute left-0 w-[45%] bg-opsos-sage-600 rounded-t hover:bg-opsos-sage-700 transition-colors"
                      style={{ height: `${coversHeight}%` }}
                      title={`${forecast.covers_predicted} covers`}
                    />

                    {/* Revenue bar */}
                    <div
                      className="absolute right-0 w-[45%] bg-brass rounded-t hover:bg-brass/80 transition-colors"
                      style={{ height: `${revenueHeight}%` }}
                      title={`$${forecast.revenue_predicted.toFixed(0)} revenue`}
                    />

                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                        <div className="font-medium">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        <div>Covers: {forecast.covers_predicted}</div>
                        <div>Revenue: ${forecast.revenue_predicted.toFixed(0)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="absolute left-16 right-0 bottom-0 h-8 flex items-start justify-around gap-2 px-4 text-xs text-muted-foreground">
            {forecasts.map((forecast, index) => {
              const date = new Date(forecast.business_date);
              const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
              const dayOfMonth = date.getDate();

              return (
                <div key={index} className="flex-1 text-center">
                  <div className="font-medium">{dayOfWeek}</div>
                  <div className="text-xs opacity-60">{dayOfMonth}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
