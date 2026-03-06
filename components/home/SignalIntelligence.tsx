'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  UserCheck,
  Target,
  UtensilsCrossed,
  AlertTriangle,
  Star,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { OrgOpenCommitment } from '@/lib/database/signal-outcomes';
import type { OrgSignalItem } from '@/lib/database/signal-analytics';

// ---------------------------------------------------------------------------
// Signal type config
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  employee_mention:  { icon: UserCheck,       color: 'text-blue-600',    label: 'Employee' },
  action_commitment: { icon: Target,          color: 'text-amber-600',   label: 'Commitment' },
  menu_item:         { icon: UtensilsCrossed, color: 'text-emerald-600', label: 'Menu' },
  operational_issue: { icon: AlertTriangle,   color: 'text-red-600',     label: 'Issue' },
  guest_insight:     { icon: Star,            color: 'text-purple-600',  label: 'Guest' },
  staffing_signal:   { icon: Users,           color: 'text-orange-600',  label: 'Staffing' },
};

const FEED_TABS = [
  { id: 'all', label: 'All' },
  { id: 'employee_mention', label: 'Employees' },
  { id: 'action_commitment', label: 'Commitments' },
  { id: 'operational_issue', label: 'Issues' },
  { id: 'guest_insight', label: 'Guest' },
  { id: 'menu_item', label: 'Menu' },
  { id: 'staffing_signal', label: 'Staffing' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  commitments: OrgOpenCommitment[];
  signals: OrgSignalItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignalIntelligence({ commitments, signals }: Props) {
  const [commitmentsOpen, setCommitmentsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const filteredSignals = useMemo(() => {
    if (activeTab === 'all') return signals;
    return signals.filter(s => s.signal_type === activeTab);
  }, [signals, activeTab]);

  return (
    <div className="space-y-6">
      {/* Open Commitments */}
      {commitments.length > 0 && (
        <div>
          <button
            onClick={() => setCommitmentsOpen(!commitmentsOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full text-left mb-3"
          >
            <Clock className="h-4 w-4" />
            Open Commitments ({commitments.length})
            {commitmentsOpen
              ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
              : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>

          {commitmentsOpen && (
            <div className="space-y-2">
              {commitments.map(c => (
                <CommitmentCard key={c.id} commitment={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Signal Feed */}
      {signals.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-muted-foreground mb-3">
            Recent Signals ({signals.length})
          </div>

          {/* Type filter tabs */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FEED_TABS.map(tab => {
              const count = tab.id === 'all'
                ? signals.length
                : signals.filter(s => s.signal_type === tab.id).length;
              if (tab.id !== 'all' && count === 0) return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    activeTab === tab.id
                      ? 'bg-brass/10 text-brass font-semibold'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Signal list */}
          <div className="space-y-1.5">
            {filteredSignals.map(signal => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
            {filteredSignals.length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No signals of this type
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commitment Card
// ---------------------------------------------------------------------------

function CommitmentCard({ commitment: c }: { commitment: OrgOpenCommitment }) {
  const [expanded, setExpanded] = useState(false);
  const isDue = c.commitment_status === 'due';
  const text = c.commitment_text || c.entity_name || 'Unspecified commitment';
  const truncated = text.length > 120;

  return (
    <div className={`border-l-4 ${isDue ? 'border-l-red-500' : 'border-l-amber-500'} rounded-r-md bg-muted/30 px-3 py-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            {truncated && !expanded ? text.slice(0, 120) + '...' : text}
            {truncated && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-brass text-xs ml-1 hover:underline"
              >
                {expanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {c.manager_name && <span>{c.manager_name}</span>}
            {c.manager_name && c.venue_name && <span>·</span>}
            <span>{c.venue_name}</span>
            <span>·</span>
            <span>{c.days_open}d ago</span>
            {c.commitment_target_date && (
              <>
                <span>·</span>
                <span>due {formatDistanceToNow(new Date(c.commitment_target_date + 'T00:00:00'), { addSuffix: true })}</span>
              </>
            )}
          </div>
        </div>
        <Badge variant={isDue ? 'error' : 'brass'} className="shrink-0">
          {isDue ? 'due' : 'open'}
        </Badge>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal Row
// ---------------------------------------------------------------------------

function SignalRow({ signal }: { signal: OrgSignalItem }) {
  const config = SIGNAL_TYPE_CONFIG[signal.signal_type] || {
    icon: AlertTriangle,
    color: 'text-muted-foreground',
    label: signal.signal_type,
  };
  const Icon = config.icon;
  const text = signal.extracted_text || '';
  const truncated = text.length > 120;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-start gap-2.5 rounded-md bg-muted/20 px-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {truncated && !expanded ? text.slice(0, 120) + '...' : text}
          {truncated && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-brass text-xs ml-1 hover:underline"
            >
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className={`font-medium ${config.color}`}>{config.label}</span>
          {signal.entity_name && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {signal.entity_name}
            </Badge>
          )}
          {signal.mention_sentiment && signal.signal_type === 'employee_mention' && (
            <span className={
              signal.mention_sentiment === 'positive' ? 'text-emerald-600' :
              signal.mention_sentiment === 'negative' ? 'text-red-600' :
              signal.mention_sentiment === 'actionable' ? 'text-amber-600' :
              'text-muted-foreground'
            }>
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
