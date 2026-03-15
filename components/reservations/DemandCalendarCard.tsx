'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Flame,
  Snowflake,
  Leaf,
  PartyPopper,
  CalendarHeart,
  ShieldCheck,
  Gauge,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface DemandCalendarData {
  demand_multiplier: number;
  is_holiday: boolean;
  holiday_name: string | null;
  has_private_event: boolean;
  private_event_is_buyout: boolean;
  private_event_type: string | null;
  private_event_guest_count: number | null;
  is_quiet_period: boolean;
  narrative: string | null;
  confidence: 'high' | 'medium' | 'low';
  open_pacing_recommended: boolean;
  lookahead_extension_days: number;
}

interface DemandCalendarCardProps {
  venueId: string;
  date: string; // YYYY-MM-DD
}

// ── Helpers ──────────────────────────────────────────────────────

function getDemandLevel(multiplier: number): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Flame;
} {
  if (multiplier >= 1.2) {
    return {
      label: 'High Demand',
      color: 'text-red-700 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      borderColor: 'border-red-200 dark:border-red-900/50',
      icon: Flame,
    };
  }
  if (multiplier <= 0.8) {
    return {
      label: 'Low Demand',
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      borderColor: 'border-blue-200 dark:border-blue-900/50',
      icon: Snowflake,
    };
  }
  return {
    label: 'Normal Demand',
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-900/50',
    icon: Leaf,
  };
}

function getConfidenceBadge(confidence: 'high' | 'medium' | 'low') {
  switch (confidence) {
    case 'high':
      return { label: 'High confidence', variant: 'default' as const, className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-0' };
    case 'medium':
      return { label: 'Medium confidence', variant: 'default' as const, className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0' };
    case 'low':
      return { label: 'Low confidence', variant: 'default' as const, className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-0' };
  }
}

function formatMultiplier(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}

// ── Component ────────────────────────────────────────────────────

export function DemandCalendarCard({ venueId, date }: DemandCalendarCardProps) {
  const [data, setData] = useState<DemandCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    fetch(`/api/reservations/demand-calendar?venue_id=${venueId}&date=${date}`)
      .then((res) => {
        if (res.status === 204) return null;
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [venueId, date]);

  // Don't render anything while loading or if no data
  if (loading || !data) return null;

  const demand = getDemandLevel(data.demand_multiplier);
  const DemandIcon = demand.icon;
  const confidenceBadge = getConfidenceBadge(data.confidence);

  return (
    <Card className={`mb-4 border ${demand.borderColor} ${demand.bgColor}`}>
      <CardContent className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <DemandIcon className={`h-4 w-4 shrink-0 ${demand.color}`} />
            <span className={`text-sm font-semibold ${demand.color}`}>
              {demand.label}
            </span>
            <span className={`text-xs font-mono ${demand.color} opacity-75`}>
              {formatMultiplier(data.demand_multiplier)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Holiday badge */}
            {data.is_holiday && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300 gap-0.5">
                <CalendarHeart className="h-3 w-3" />
                {data.holiday_name || 'Holiday'}
              </Badge>
            )}

            {/* Private event badge */}
            {data.has_private_event && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 gap-0.5">
                <PartyPopper className="h-3 w-3" />
                {data.private_event_is_buyout ? 'Buyout' : 'Private Event'}
              </Badge>
            )}

            {/* Quiet period warning */}
            {data.is_quiet_period && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 gap-0.5">
                <Snowflake className="h-3 w-3" />
                Quiet Period
              </Badge>
            )}

            {/* Pacing recommendation */}
            {data.open_pacing_recommended && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300 gap-0.5">
                <Gauge className="h-3 w-3" />
                Open Pacing
              </Badge>
            )}

            {/* Expand/collapse for narrative */}
            {data.narrative && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label={expanded ? 'Collapse details' : 'Expand details'}
              >
                {expanded
                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </button>
            )}
          </div>
        </div>

        {/* Expanded narrative */}
        {expanded && data.narrative && (
          <div className="mt-2 pt-2 border-t border-current/10">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {data.narrative}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={confidenceBadge.variant} className={`text-[10px] px-1.5 py-0 ${confidenceBadge.className}`}>
                <ShieldCheck className="h-3 w-3 mr-0.5" />
                {confidenceBadge.label}
              </Badge>
              {data.lookahead_extension_days > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  +{data.lookahead_extension_days}d lookahead extension
                </span>
              )}
              {data.has_private_event && data.private_event_guest_count && (
                <span className="text-[10px] text-muted-foreground">
                  {data.private_event_guest_count} event guests
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
