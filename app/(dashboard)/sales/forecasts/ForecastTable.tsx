'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil } from 'lucide-react';
import { OverrideDialog } from '@/components/forecast/OverrideDialog';

interface ForecastRow {
  id: string;
  venue_id: string;
  business_date: string;
  shift_type: string;
  day_type: string;
  covers_raw: number;
  covers_predicted: number;
  covers_lower: number;
  covers_upper: number;
  revenue_predicted: number;
  confidence_level: number;
  day_type_offset: number;
  holiday_offset: number;
  holiday_code: string | null;
  pacing_multiplier: number;
  venue_class: string;
  on_hand_resos: number | null;
  typical_resos: number | null;
  bias_corrected: boolean;
}

interface Override {
  business_date: string;
  shift_type: string;
  forecast_post_override: number;
  reason_code: string;
  delta: number;
}

interface ForecastTableProps {
  forecasts: ForecastRow[];
  overrideMap: Record<string, Override>;
  venueId: string;
}

export function ForecastTable({ forecasts, overrideMap, venueId }: ForecastTableProps) {
  const router = useRouter();
  const [selectedForecast, setSelectedForecast] = useState<ForecastRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOverrideClick = (forecast: ForecastRow) => {
    setSelectedForecast(forecast);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    router.refresh();
  };

  return (
    <>
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Daily Forecast Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Day</th>
                <th className="pb-3 font-medium">Shift</th>
                <th className="pb-3 font-medium text-right">Base</th>
                <th className="pb-3 font-medium text-right">Adjusted</th>
                <th className="pb-3 font-medium text-right">Revenue</th>
                <th className="pb-3 font-medium text-right">Layers</th>
                <th className="pb-3 font-medium text-right">Confidence</th>
                <th className="pb-3 font-medium text-center w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {forecasts.map((forecast) => {
                const date = new Date(forecast.business_date + 'T12:00:00');
                const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                const overrideKey = `${forecast.business_date}|${forecast.shift_type}`;
                const override = overrideMap[overrideKey];
                const displayCovers = override
                  ? override.forecast_post_override
                  : forecast.covers_predicted;
                const hasAdjustments = forecast.day_type_offset !== 0
                  || forecast.holiday_offset !== 0
                  || forecast.pacing_multiplier !== 1;

                return (
                  <tr key={forecast.id} className="hover:bg-muted/30 group">
                    <td className="py-3 text-sm">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="py-3 text-sm font-medium">
                      {dayOfWeek}
                      {forecast.holiday_code && (
                        <Badge variant="outline" className="ml-1 text-[10px] py-0">
                          {forecast.holiday_code}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 text-sm text-muted-foreground capitalize">
                      {forecast.shift_type}
                    </td>
                    <td className="py-3 text-sm text-right font-mono text-muted-foreground">
                      {forecast.covers_raw}
                    </td>
                    <td className="py-3 text-sm text-right font-mono">
                      <span className={override ? 'line-through text-muted-foreground mr-1' : 'font-medium'}>
                        {forecast.covers_predicted}
                      </span>
                      {override && (
                        <span className="font-medium text-brass">
                          {override.forecast_post_override}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({forecast.covers_lower}-{forecast.covers_upper})
                      </span>
                    </td>
                    <td className="py-3 text-sm text-right font-mono">
                      ${forecast.revenue_predicted?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}
                    </td>
                    <td className="py-3 text-sm text-right">
                      {hasAdjustments ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          {forecast.day_type_offset !== 0 && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              DT {forecast.day_type_offset > 0 ? '+' : ''}{forecast.day_type_offset}
                            </Badge>
                          )}
                          {forecast.holiday_offset !== 0 && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              H {forecast.holiday_offset > 0 ? '+' : ''}{forecast.holiday_offset}
                            </Badge>
                          )}
                          {forecast.pacing_multiplier !== 1 && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              P x{forecast.pacing_multiplier?.toFixed(2)}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {override && (
                        <Badge variant="outline" className="text-[10px] py-0 ml-1 border-brass text-brass">
                          {override.reason_code.replace('_', ' ')}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 text-sm text-right">
                      <span className={`font-medium ${
                        forecast.confidence_level >= 0.85 ? 'text-opsos-sage-600' :
                        forecast.confidence_level >= 0.70 ? 'text-brass' :
                        'text-muted-foreground'
                      }`}>
                        {((forecast.confidence_level || 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                        onClick={() => handleOverrideClick(forecast)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <OverrideDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        forecast={selectedForecast}
        onSaved={handleSaved}
      />
    </>
  );
}
