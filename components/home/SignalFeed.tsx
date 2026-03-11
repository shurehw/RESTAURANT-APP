'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Star,
  UserCheck,
  Users,
  UtensilsCrossed,
  Music,
  DollarSign,
  ChefHat,
  TrendingUp,
  type LucideIcon,
  Radio,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import type { OrgSignalItem } from '@/lib/database/signal-analytics';
import type { SignalTrendData, SignalTrendBucket } from '@/lib/database/signal-analytics';

const SIGNAL_TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string; chartColor: string; label: string }> = {
  employee_mention: { icon: UserCheck, color: 'text-blue-600', chartColor: '#2563eb', label: 'Employee' },
  menu_item: { icon: UtensilsCrossed, color: 'text-emerald-600', chartColor: '#059669', label: 'Menu' },
  operational_issue: { icon: AlertTriangle, color: 'text-red-600', chartColor: '#dc2626', label: 'Issue' },
  guest_insight: { icon: Star, color: 'text-purple-600', chartColor: '#9333ea', label: 'Guest' },
  staffing_signal: { icon: Users, color: 'text-orange-600', chartColor: '#ea580c', label: 'Staffing' },
  entertainment: { icon: Music, color: 'text-pink-600', chartColor: '#db2777', label: 'Entertainment' },
  comp_pattern: { icon: DollarSign, color: 'text-amber-600', chartColor: '#d97706', label: 'Comps' },
  culinary: { icon: ChefHat, color: 'text-teal-600', chartColor: '#0d9488', label: 'Culinary' },
  revenue_insight: { icon: TrendingUp, color: 'text-indigo-600', chartColor: '#4f46e5', label: 'Revenue' },
};

const CHART_SERIES = [
  { key: 'employee', label: 'Employee', color: '#2563eb' },
  { key: 'issue', label: 'Issue', color: '#dc2626' },
  { key: 'guest', label: 'Guest', color: '#9333ea' },
  { key: 'menu', label: 'Menu', color: '#059669' },
  { key: 'staffing', label: 'Staffing', color: '#ea580c' },
  { key: 'entertainment', label: 'Entertainment', color: '#db2777' },
  { key: 'comps', label: 'Comps', color: '#d97706' },
  { key: 'culinary', label: 'Culinary', color: '#0d9488' },
  { key: 'revenue', label: 'Revenue', color: '#4f46e5' },
] as const;

const FEED_TABS = [
  { id: 'all', label: 'All' },
  { id: 'employee_mention', label: 'Employees' },
  { id: 'operational_issue', label: 'Issues' },
  { id: 'guest_insight', label: 'Guest' },
  { id: 'menu_item', label: 'Menu' },
  { id: 'staffing_signal', label: 'Staffing' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'comp_pattern', label: 'Comps' },
  { id: 'culinary', label: 'Culinary' },
  { id: 'revenue_insight', label: 'Revenue' },
];

type TrendView = 'weekly' | 'period' | 'yearly';

interface SignalFeedProps {
  signals: OrgSignalItem[];
  trendData: SignalTrendData;
}

export function SignalFeed({ signals, trendData }: SignalFeedProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [trendView, setTrendView] = useState<TrendView>('weekly');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const informationalSignals = useMemo(
    () => signals.filter((s) => s.signal_type !== 'action_commitment'),
    [signals],
  );

  const entityClusters = useMemo(() => {
    const byEntity = new Map<string, {
      count: number; positive: number; negative: number; neutral: number; actionable: number;
    }>();

    for (const s of informationalSignals) {
      if (!s.entity_name) continue;
      const name = s.entity_name;
      if (!byEntity.has(name)) {
        byEntity.set(name, { count: 0, positive: 0, negative: 0, neutral: 0, actionable: 0 });
      }
      const cluster = byEntity.get(name)!;
      cluster.count++;
      if (s.mention_sentiment === 'positive') cluster.positive++;
      else if (s.mention_sentiment === 'negative') cluster.negative++;
      else if (s.mention_sentiment === 'actionable') cluster.actionable++;
      else cluster.neutral++;
    }

    return [...byEntity.entries()]
      .filter(([, data]) => data.count >= 2)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [informationalSignals]);

  const filteredSignals = useMemo(() => {
    let filtered = activeTab === 'all'
      ? informationalSignals
      : informationalSignals.filter((s) => s.signal_type === activeTab);

    if (selectedEntity) {
      filtered = filtered.filter((s) => s.entity_name === selectedEntity);
    }

    return filtered;
  }, [informationalSignals, activeTab, selectedEntity]);

  const chartData: SignalTrendBucket[] = trendData[trendView] || [];
  const hasTrend = chartData.some((b) => b.total > 0);

  if (informationalSignals.length === 0 && !hasTrend) return null;

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 text-left"
      >
        <Radio className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Signal Feed</h2>
          <p className="text-xs text-muted-foreground">
            Signal trends and recent observations
          </p>
        </div>
        <span className="ml-1 text-xs text-muted-foreground">
          ({informationalSignals.length} this week)
        </span>
        {isOpen ? (
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="mt-4 space-y-5">
          {/* Trend Chart */}
          {chartData.length > 0 && (
            <div>
              {/* View Toggle */}
              <div className="mb-3 flex items-center justify-between">
                <div className="inline-flex rounded-md border border-border text-xs">
                  {(['weekly', 'period', 'yearly'] as const).map((view, i) => (
                    <button
                      key={view}
                      onClick={() => setTrendView(view)}
                      className={`px-2.5 py-1 transition-colors ${
                        i === 0 ? 'rounded-l-md' : ''
                      } ${i === 2 ? 'rounded-r-md' : ''} ${
                        i > 0 ? 'border-l border-border' : ''
                      } ${
                        trendView === view
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {view === 'weekly' ? 'Weekly' : view === 'period' ? 'Period' : 'Year'}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  {CHART_SERIES.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="signals"
                      fill={s.color}
                      radius={s.key === 'revenue' ? [2, 2, 0, 0] : undefined}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                {CHART_SERIES.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entity Clustering */}
          {entityClusters.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                Recurring Entities
              </h3>
              <div className="flex flex-wrap gap-2">
                {entityClusters.map((entity) => (
                  <button
                    key={entity.name}
                    onClick={() =>
                      setSelectedEntity(selectedEntity === entity.name ? null : entity.name)
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                      selectedEntity === entity.name
                        ? 'bg-brass/10 font-semibold text-brass ring-1 ring-brass/30'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="font-medium">{entity.name}</span>
                    <span className="text-[10px] opacity-70">{entity.count}</span>
                    <span className="ml-0.5 inline-flex gap-px">
                      {entity.negative > 0 && (
                        <span
                          className="inline-block h-2 rounded-sm bg-red-400"
                          style={{ width: `${Math.max(4, entity.negative * 6)}px` }}
                        />
                      )}
                      {entity.actionable > 0 && (
                        <span
                          className="inline-block h-2 rounded-sm bg-amber-400"
                          style={{ width: `${Math.max(4, entity.actionable * 6)}px` }}
                        />
                      )}
                      {entity.neutral > 0 && (
                        <span
                          className="inline-block h-2 rounded-sm bg-gray-300"
                          style={{ width: `${Math.max(4, entity.neutral * 6)}px` }}
                        />
                      )}
                      {entity.positive > 0 && (
                        <span
                          className="inline-block h-2 rounded-sm bg-emerald-400"
                          style={{ width: `${Math.max(4, entity.positive * 6)}px` }}
                        />
                      )}
                    </span>
                  </button>
                ))}
                {selectedEntity && (
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter tabs + signal rows */}
          {informationalSignals.length > 0 && (
            <div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {FEED_TABS.map((tab) => {
                  const count =
                    tab.id === 'all'
                      ? informationalSignals.length
                      : informationalSignals.filter((s) => s.signal_type === tab.id).length;
                  if (tab.id !== 'all' && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                        activeTab === tab.id
                          ? 'bg-brass/10 font-semibold text-brass'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                {filteredSignals.map((signal) => (
                  <SignalRow key={signal.id} signal={signal} />
                ))}
                {filteredSignals.length === 0 && (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    No signals of this type
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: OrgSignalItem }) {
  const config = SIGNAL_TYPE_CONFIG[signal.signal_type] || {
    icon: AlertTriangle,
    color: 'text-muted-foreground',
    chartColor: '#6b7280',
    label: signal.signal_type,
  };
  const Icon = config.icon;
  const text = signal.extracted_text || '';
  const truncated = text.length > 120;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-start gap-2.5 rounded-md bg-muted/20 px-3 py-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {truncated && !expanded ? `${text.slice(0, 120)}...` : text}
          {truncated && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-xs text-brass hover:underline"
            >
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={`font-medium ${config.color}`}>{config.label}</span>
          {signal.entity_name && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {signal.entity_name}
            </Badge>
          )}
          {signal.mention_sentiment && signal.signal_type === 'employee_mention' && (
            <span
              className={
                signal.mention_sentiment === 'positive'
                  ? 'text-emerald-600'
                  : signal.mention_sentiment === 'negative'
                    ? 'text-red-600'
                    : signal.mention_sentiment === 'actionable'
                      ? 'text-amber-600'
                      : 'text-muted-foreground'
              }
            >
              {signal.mention_sentiment}
            </span>
          )}
          <span>{signal.venue_name}</span>
          {signal.manager_name && (
            <>
              <span>·</span>
              <span>{signal.manager_name}</span>
            </>
          )}
          <span>·</span>
          <span>{signal.business_date}</span>
        </div>
      </div>
    </div>
  );
}
