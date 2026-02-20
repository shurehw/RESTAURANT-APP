'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { OverrideDialog } from '@/components/forecast/OverrideDialog';
import { IntervalDrilldown } from './IntervalDrilldown';

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
  food_revenue_predicted: number | null;
  bev_revenue_predicted: number | null;
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
  shift_type: string | null;
  forecast_post_override: number;
  reason_code: string;
  delta: number | null;
}

interface ForecastTableProps {
  forecasts: ForecastRow[];
  overrideMap: Record<string, Override>;
  venueId: string;
}

/** Confidence tier from within-10% hit rate */
function confidenceTier(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 60) return { label: 'Strong', color: 'text-opsos-sage-600', bg: 'bg-sage/10' };
  if (pct >= 40) return { label: 'Good', color: 'text-opsos-sage-600', bg: 'bg-sage/10' };
  if (pct >= 25) return { label: 'Fair', color: 'text-brass', bg: 'bg-brass/10' };
  return { label: 'Low', color: 'text-muted-foreground', bg: 'bg-muted' };
}

/** Build a short human-readable explanation of what adjustments were applied */
function adjustmentSummary(forecast: ForecastRow): string | null {
  const parts: string[] = [];

  if (forecast.day_type_offset !== 0) {
    const dir = forecast.day_type_offset > 0 ? 'up' : 'down';
    const abs = Math.abs(forecast.day_type_offset);
    const dayName: Record<string, string> = {
      weekday: 'weekday', friday: 'Friday', saturday: 'Saturday',
      sunday: 'Sunday', holiday: 'holiday',
    };
    parts.push(`${dayName[forecast.day_type] || forecast.day_type} pattern ${dir} ${abs}`);
  }

  if (forecast.holiday_offset !== 0) {
    const dir = forecast.holiday_offset > 0 ? 'up' : 'down';
    parts.push(`holiday adj ${dir} ${Math.abs(forecast.holiday_offset)}`);
  }

  if (forecast.pacing_multiplier !== 1) {
    const dir = forecast.pacing_multiplier > 1 ? 'above' : 'below';
    parts.push(`resos ${dir} typical`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

export function ForecastTable({ forecasts, overrideMap, venueId }: ForecastTableProps) {
  const router = useRouter();
  const [selectedForecast, setSelectedForecast] = useState<ForecastRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Only show shift column if there are multiple shift types
  const shiftTypes = new Set(forecasts.map(f => f.shift_type));
  const showShift = shiftTypes.size > 1;

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
                {showShift && <th className="pb-3 font-medium">Shift</th>}
                <th className="pb-3 font-medium text-right">Covers</th>
                <th className="pb-3 font-medium text-right">Revenue</th>
                <th className="pb-3 font-medium text-right">Reliability</th>
                <th className="pb-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {forecasts.map((forecast) => {
                const date = new Date(forecast.business_date + 'T12:00:00');
                const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const overrideKey = `${forecast.business_date}|${forecast.shift_type}`;
                const override = overrideMap[overrideKey];
                const tier = confidenceTier(forecast.confidence_pct);
                const adjText = adjustmentSummary(forecast);
                const isExpanded = expandedDate === forecast.business_date;
                const colSpan = 4 + (showShift ? 1 : 0) + 1; // date + shift? + covers + revenue + reliability + actions

                // ± range from midpoint
                const margin = Math.round(
                  (forecast.covers_upper - forecast.covers_lower) / 2
                );

                return (
                  <tr key={forecast.id} className="contents">
                    {/* Main row — wrapped in a sub-table-structure via contents + individual cells */}
                    <td colSpan={colSpan} className="p-0">
                      <div
                        className="hover:bg-muted/30 group grid items-center cursor-pointer"
                        style={{ gridTemplateColumns: showShift ? '1fr auto auto auto auto auto' : '1fr auto auto auto auto' }}
                        onClick={() => setExpandedDate(isExpanded ? null : forecast.business_date)}
                      >
                        {/* Date + expand chevron */}
                        <div className="py-3.5 text-sm flex items-center gap-1.5 pl-1">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          }
                          <span className="font-medium">{dayOfWeek}</span>
                          <span className="text-muted-foreground">{dateStr}</span>
                          {forecast.holiday_code && (
                            <Badge variant="brass" className="text-[10px] py-0">
                              {forecast.holiday_code}
                            </Badge>
                          )}
                        </div>

                        {/* Shift (only if multiple) */}
                        {showShift && (
                          <div className="py-3.5 text-sm text-muted-foreground capitalize">
                            {forecast.shift_type}
                          </div>
                        )}

                        {/* Covers */}
                        <div className="py-3.5 text-right pr-4">
                          <div className="font-mono">
                            {override ? (
                              <>
                                <span className="text-sm line-through text-muted-foreground mr-1">
                                  {forecast.covers_predicted}
                                </span>
                                <span className="text-lg font-semibold text-brass">
                                  {override.forecast_post_override}
                                </span>
                              </>
                            ) : (
                              <span className="text-lg font-semibold">
                                {forecast.covers_predicted}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-1">
                              ±{margin}
                            </span>
                          </div>
                        </div>

                        {/* Revenue */}
                        <div className="py-3.5 text-right font-mono pr-4">
                          <div className="text-sm text-muted-foreground">
                            ${forecast.revenue_predicted?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}
                          </div>
                          {forecast.food_revenue_predicted != null && forecast.bev_revenue_predicted != null && (
                            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                              F ${Math.round(forecast.food_revenue_predicted).toLocaleString()}
                              {' · '}
                              B ${Math.round(forecast.bev_revenue_predicted).toLocaleString()}
                            </div>
                          )}
                        </div>

                        {/* Reliability */}
                        <div className="py-3.5 text-sm text-right pr-2">
                          {forecast.accuracy_sample_size > 0 ? (
                            <div>
                              <Badge variant="default" className={`text-[11px] py-0.5 px-2 ${tier.bg} ${tier.color} border-0`}>
                                {tier.label}
                              </Badge>
                              {adjText && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {adjText}
                                </div>
                              )}
                              {override && (
                                <div className="text-[10px] text-brass mt-0.5">
                                  override: {override.reason_code.replace(/_/g, ' ').toLowerCase()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <Badge variant="default" className="text-[11px] py-0.5 px-2">
                                New
                              </Badge>
                              {adjText && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {adjText}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Override button */}
                        <div className="py-3.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOverrideClick(forecast);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded interval drilldown */}
                      {isExpanded && (
                        <div className="border-t border-muted/50 bg-muted/10">
                          <IntervalDrilldown
                            venueId={venueId}
                            businessDate={forecast.business_date}
                            dayType={forecast.day_type}
                          />
                        </div>
                      )}
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
