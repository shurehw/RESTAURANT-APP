'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Receipt,
  Loader2,
  Sparkles,
  Star,
  ArrowUp,
  ArrowDown,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface ServerData {
  employee_name: string;
  employee_role_name: string;
  tickets: number;
  covers: number;
  net_sales: number;
  avg_ticket: number;
  avg_turn_mins: number;
  avg_per_cover: number;
  tip_pct: number | null;
  total_tips: number;
}

interface TeamAverages {
  avg_covers: number;
  avg_net_sales: number;
  avg_ticket: number;
  avg_turn_mins: number;
  avg_per_cover: number;
  avg_tip_pct: number | null;
  server_count: number;
}

interface AIReview {
  overallRating: 'excellent' | 'strong' | 'average' | 'needs_improvement';
  summary: string;
  strengths: string[];
  improvements: string[];
  coachingTip: string;
}

interface ServerDetailModalProps {
  server: ServerData | null;
  teamAverages: TeamAverages;
  date: string;
  venueName: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const ratingConfig = {
  excellent: { label: 'Excellent', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  strong: { label: 'Strong', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  average: { label: 'Average', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  needs_improvement: { label: 'Needs Improvement', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export function ServerDetailModal({
  server,
  teamAverages,
  date,
  venueName,
  isOpen,
  onClose,
}: ServerDetailModalProps) {
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, AIReview>>(new Map());

  useEffect(() => {
    if (!isOpen || !server) return;

    const cacheKey = `${date}-${server.employee_name}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setAiReview(cached);
      setAiError(null);
      return;
    }

    setLoadingAI(true);
    setAiReview(null);
    setAiError(null);

    fetch('/api/ai/server-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, venueName, server, teamAverages }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to generate feedback');
        return res.json();
      })
      .then((data) => {
        const review = data.data as AIReview;
        setAiReview(review);
        cacheRef.current.set(cacheKey, review);
      })
      .catch(() => setAiError('Unable to generate AI feedback'))
      .finally(() => setLoadingAI(false));
  }, [isOpen, server?.employee_name, date, venueName]);

  if (!server) return null;

  // Metric comparison helper
  const metrics: Array<{
    label: string;
    value: string;
    teamAvg: string;
    diff: number | null; // percentage difference
    icon: React.ReactNode;
    invertComparison?: boolean; // true = lower is better (turn time)
  }> = [
    {
      label: 'Net Sales',
      value: formatCurrency(server.net_sales),
      teamAvg: formatCurrency(teamAverages.avg_net_sales),
      diff: teamAverages.avg_net_sales > 0
        ? ((server.net_sales - teamAverages.avg_net_sales) / teamAverages.avg_net_sales) * 100
        : null,
      icon: <DollarSign className="h-4 w-4" />,
    },
    {
      label: 'Covers',
      value: String(server.covers),
      teamAvg: teamAverages.avg_covers.toFixed(0),
      diff: teamAverages.avg_covers > 0
        ? ((server.covers - teamAverages.avg_covers) / teamAverages.avg_covers) * 100
        : null,
      icon: <Users className="h-4 w-4" />,
    },
    {
      label: 'Avg/Cover',
      value: formatCurrencyDecimal(server.avg_per_cover),
      teamAvg: formatCurrencyDecimal(teamAverages.avg_per_cover),
      diff: teamAverages.avg_per_cover > 0
        ? ((server.avg_per_cover - teamAverages.avg_per_cover) / teamAverages.avg_per_cover) * 100
        : null,
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      label: 'Avg Ticket',
      value: formatCurrencyDecimal(server.avg_ticket),
      teamAvg: formatCurrencyDecimal(teamAverages.avg_ticket),
      diff: teamAverages.avg_ticket > 0
        ? ((server.avg_ticket - teamAverages.avg_ticket) / teamAverages.avg_ticket) * 100
        : null,
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Tickets',
      value: String(server.tickets),
      teamAvg: (teamAverages.avg_net_sales / (teamAverages.avg_ticket || 1)).toFixed(0),
      diff: teamAverages.avg_ticket > 0
        ? ((server.tickets - teamAverages.avg_net_sales / teamAverages.avg_ticket) /
            (teamAverages.avg_net_sales / teamAverages.avg_ticket)) * 100
        : null,
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Turn Time',
      value: server.avg_turn_mins ? `${server.avg_turn_mins} min` : '---',
      teamAvg: teamAverages.avg_turn_mins ? `${teamAverages.avg_turn_mins.toFixed(0)} min` : '---',
      diff: server.avg_turn_mins && teamAverages.avg_turn_mins
        ? ((server.avg_turn_mins - teamAverages.avg_turn_mins) / teamAverages.avg_turn_mins) * 100
        : null,
      icon: <Clock className="h-4 w-4" />,
      invertComparison: true,
    },
    {
      label: 'Tip %',
      value: server.tip_pct != null ? `${server.tip_pct}%` : '---',
      teamAvg: teamAverages.avg_tip_pct != null ? `${teamAverages.avg_tip_pct.toFixed(1)}%` : '---',
      diff: server.tip_pct != null && teamAverages.avg_tip_pct != null && teamAverages.avg_tip_pct > 0
        ? ((server.tip_pct - teamAverages.avg_tip_pct) / teamAverages.avg_tip_pct) * 100
        : null,
      icon: <Star className="h-4 w-4" />,
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Users className="h-5 w-5 text-sage" />
            <div>
              <div className="text-lg">{server.employee_name}</div>
              <div className="text-sm font-normal text-muted-foreground">
                {server.employee_role_name}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
          {metrics.map((metric) => {
            const isPositive = metric.diff != null
              ? metric.invertComparison ? metric.diff < 0 : metric.diff > 0
              : null;
            const diffAbs = metric.diff != null ? Math.abs(metric.diff) : null;

            return (
              <div
                key={metric.label}
                className="rounded-lg border border-brass/20 p-3 space-y-1"
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {metric.icon}
                  {metric.label}
                </div>
                <div className="text-lg font-semibold">{metric.value}</div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">Avg: {metric.teamAvg}</span>
                  {diffAbs != null && diffAbs > 1 && (
                    <span className={`flex items-center gap-0.5 font-medium ${
                      isPositive ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {diffAbs.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Coaching Section */}
        <div className="mt-4 rounded-lg border border-brass/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-brass/20 bg-muted/30">
            <Sparkles className="h-4 w-4 text-brass" />
            <span className="font-medium text-sm">AI Performance Coaching</span>
          </div>

          <div className="p-4">
            {loadingAI && (
              <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Analyzing performance...</span>
              </div>
            )}

            {aiError && (
              <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{aiError}</span>
              </div>
            )}

            {aiReview && (
              <div className="space-y-4">
                {/* Rating + Summary */}
                <div className="flex items-start gap-3">
                  <Badge
                    variant="outline"
                    className={ratingConfig[aiReview.overallRating].className}
                  >
                    {ratingConfig[aiReview.overallRating].label}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{aiReview.summary}</p>

                {/* Strengths */}
                {aiReview.strengths.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 mb-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Strengths
                    </div>
                    <ul className="space-y-1">
                      {aiReview.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-muted-foreground pl-5">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {aiReview.improvements.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500 mb-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Areas to Improve
                    </div>
                    <ul className="space-y-1">
                      {aiReview.improvements.map((s, i) => (
                        <li key={i} className="text-sm text-muted-foreground pl-5">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Coaching Tip */}
                <div className="rounded-md bg-brass/10 border border-brass/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-brass mb-1">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Coaching Tip
                  </div>
                  <p className="text-sm">{aiReview.coachingTip}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
