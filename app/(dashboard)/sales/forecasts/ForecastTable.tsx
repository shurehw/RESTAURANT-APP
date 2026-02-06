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
  confidence_pct: number;
  historical_mape: number;
  accuracy_sample_size: number;
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

/** Human-readable day-type label for adjustments */
function dayTypeLabel(dayType: string): string {
  switch (dayType) {
    case 'weekday': return 'Weekday';
    case 'friday': return 'Fri';
    case 'saturday': return 'Sat';
    case 'sunday': return 'Sun';
    case 'holiday': return 'Holiday';
    default: return dayType;
  }
}

/** Convert within-10% accuracy into a human-readable label */
function trackRecordLabel(pct: number): { label: string; color: string } {
  if (pct >= 60) return { label: 'Strong', color: 'text-opsos-sage-600' };
  if (pct >= 40) return { label: 'Good', color: 'text-opsos-sage-600' };
  if (pct >= 25) return { label: 'Fair', color: 'text-brass' };
  return { label: 'Low', color: 'text-muted-foreground' };
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
                <th className="pb-3 font-medium">Shift</th>
                <th className="pb-3 font-medium text-right">Covers</th>
                <th className="pb-3 font-medium text-right">Revenue</th>
                <th className="pb-3 font-medium text-right">Adjustments</th>
                <th className="pb-3 font-medium text-right">Track Record</th>
                <th className="pb-3 font-medium text-center w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {forecasts.map((forecast) => {
                const date = new Date(forecast.business_date + 'T12:00:00');
                const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const overrideKey = `${forecast.business_date}|${forecast.shift_type}`;
                const override = overrideMap[overrideKey];
                const hasAdjustments = forecast.day_type_offset !== 0
                  || forecast.holiday_offset !== 0
                  || forecast.pacing_multiplier !== 1;
                const track = trackRecordLabel(forecast.confidence_pct);

                return (
                  <tr key={forecast.id} className="hover:bg-muted/30 group">
                    {/* Date + Day combined */}
                    <td className="py-3 text-sm">
                      <span className="font-medium">{dayOfWeek}</span>
                      <span className="text-muted-foreground ml-1">{dateStr}</span>
                      {forecast.holiday_code && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                          {forecast.holiday_code}
                        </Badge>
                      )}
                    </td>

                    {/* Shift */}
                    <td className="py-3 text-sm text-muted-foreground capitalize">
                      {forecast.shift_type}
                    </td>

                    {/* Covers - the primary number */}
                    <td className="py-3 text-sm text-right">
                      <div className="font-mono">
                        {override ? (
                          <>
                            <span className="line-through text-muted-foreground mr-1">
                              {forecast.covers_predicted}
                            </span>
                            <span className="font-semibold text-brass">
                              {override.forecast_post_override}
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold">{forecast.covers_predicted}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {forecast.covers_lower}-{forecast.covers_upper} range
                      </div>
                    </td>

                    {/* Revenue */}
                    <td className="py-3 text-sm text-right font-mono">
                      ${forecast.revenue_predicted?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}
                    </td>

                    {/* Adjustments - human-readable */}
                    <td className="py-3 text-sm text-right">
                      {hasAdjustments || override ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          {forecast.day_type_offset !== 0 && (
                            <Badge variant="default" className="text-[10px] py-0">
                              {dayTypeLabel(forecast.day_type)} {forecast.day_type_offset > 0 ? '+' : ''}{forecast.day_type_offset}
                            </Badge>
                          )}
                          {forecast.holiday_offset !== 0 && (
                            <Badge variant="default" className="text-[10px] py-0">
                              Holiday {forecast.holiday_offset > 0 ? '+' : ''}{forecast.holiday_offset}
                            </Badge>
                          )}
                          {forecast.pacing_multiplier !== 1 && (
                            <Badge variant="default" className="text-[10px] py-0">
                              Pacing x{forecast.pacing_multiplier?.toFixed(2)}
                            </Badge>
                          )}
                          {override && (
                            <Badge variant="outline" className="text-[10px] py-0 border-brass text-brass">
                              {override.reason_code.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">None</span>
                      )}
                    </td>

                    {/* Track Record */}
                    <td className="py-3 text-sm text-right">
                      {forecast.accuracy_sample_size > 0 ? (
                        <div className="text-right">
                          <span className={`font-medium ${track.color}`}>
                            {track.label}
                          </span>
                          <span className={`text-xs ${track.color} ml-0.5`}>
                            {Math.round(forecast.confidence_pct)}%
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            {forecast.accuracy_sample_size} past forecasts
                          </div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="text-muted-foreground text-xs">New</span>
                          <div className="text-[10px] text-muted-foreground">
                            No history yet
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Override button */}
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
