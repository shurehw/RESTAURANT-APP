'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';
import type { ManagerFollowThrough } from '@/lib/database/signal-analytics';

interface FollowThroughRateProps {
  managers: ManagerFollowThrough[];
  currentUserId: string;
  isOperator: boolean;
}

export function FollowThroughRate({ managers, currentUserId, isOperator }: FollowThroughRateProps) {
  const [isOpen, setIsOpen] = useState(false);

  const visibleManagers = useMemo(() => {
    if (isOperator) return managers;
    return managers.filter((m) => m.manager_id === currentUserId);
  }, [managers, currentUserId, isOperator]);

  if (visibleManagers.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 text-left"
      >
        <Target className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Commitment Follow-Through</h2>
          <p className="text-xs text-muted-foreground">
            Manager accountability — 90-day window
          </p>
        </div>
        {isOpen ? (
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="mt-4 space-y-2">
          {visibleManagers.map((manager) => (
            <ManagerRow key={manager.manager_id} manager={manager} />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerRow({ manager }: { manager: ManagerFollowThrough }) {
  const pct = Math.round(manager.follow_through_rate * 100);
  const colorClass =
    pct >= 80
      ? 'text-emerald-700 bg-emerald-100'
      : pct >= 50
        ? 'text-amber-700 bg-amber-100'
        : 'text-red-700 bg-red-100';
  const barColor =
    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/20 px-3 py-2">
      <span
        className={`inline-flex w-12 items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold ${colorClass}`}
      >
        {pct}%
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {manager.manager_name || 'Unknown'}
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-1.5 rounded-full ${barColor} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <span>{manager.commitments_made} made</span>
        {manager.commitments_open > 0 && (
          <span> · {manager.commitments_open} open</span>
        )}
      </div>
    </div>
  );
}
