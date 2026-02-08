'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Clock, User, FileText } from 'lucide-react';

interface ChangeEntry {
  id: string;
  feedback_type: string;
  business_date: string | null;
  original_recommendation: string | null;
  manager_decision: string | null;
  reason: string | null;
  created_at: string;
}

interface Props {
  venueId: string;
  weekStart: string;
}

export function ScheduleChangeLog({ venueId, weekStart }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expanded && changes.length === 0) {
      loadChanges();
    }
  }, [expanded]);

  const loadChanges = async () => {
    setLoading(true);
    try {
      const weekEnd = new Date(new Date(weekStart + 'T00:00:00').getTime() + 6 * 86400000)
        .toISOString().split('T')[0];

      const res = await fetch(
        `/api/labor/schedule/shifts?venue_id=${venueId}&week_start=${weekStart}&week_end=${weekEnd}&changes_only=true`
      );

      if (res.ok) {
        const data = await res.json();
        setChanges(data.changes || []);
      }
    } catch (err) {
      console.error('Failed to load change log:', err);
    } finally {
      setLoading(false);
    }
  };

  const parseJSON = (str: string | null): Record<string, any> | null => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  const formatChange = (entry: ChangeEntry) => {
    const original = parseJSON(entry.original_recommendation);
    const decision = parseJSON(entry.manager_decision);

    if (!original || !decision) {
      return entry.reason || 'Change recorded';
    }

    // Shift removed
    if (decision.action === 'shift_removed') {
      return `Removed shift for ${original.employee_name || 'employee'} (${original.position_name || 'position'})`;
    }

    // Shift added
    if (decision.action === 'added_shift') {
      return `Added new ${decision.shift_type || ''} shift (${decision.scheduled_hours || 0}h)`;
    }

    // Employee swap
    if (original.employee_id !== decision.employee_id && decision.employee_name) {
      return `Swapped ${original.employee_name || 'employee'} → ${decision.employee_name}`;
    }

    // Time change
    if (original.scheduled_start !== decision.scheduled_start || original.scheduled_end !== decision.scheduled_end) {
      return `Changed shift times for ${original.employee_name || 'employee'}`;
    }

    return entry.reason || 'Shift modified';
  };

  const extractCategory = (reason: string | null): string => {
    if (!reason) return 'Other';
    const match = reason.match(/^\[([^\]]+)\]/);
    return match ? match[1] : 'Other';
  };

  const extractReasonText = (reason: string | null): string => {
    if (!reason) return '';
    return reason.replace(/^\[[^\]]+\]\s*/, '');
  };

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-900">Change Log</span>
          {changes.length > 0 && (
            <Badge variant="brass" className="text-xs">{changes.length}</Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4">
          {loading && (
            <div className="py-6 text-center text-sm text-gray-500">Loading changes...</div>
          )}

          {!loading && changes.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-500">
              No modifications have been made to this schedule yet.
            </div>
          )}

          {!loading && changes.length > 0 && (
            <div className="space-y-3 mt-3">
              {changes.map((entry) => {
                const category = extractCategory(entry.reason);
                const reasonText = extractReasonText(entry.reason);

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-md text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">
                        {formatChange(entry)}
                      </div>
                      {reasonText && (
                        <div className="text-gray-600 mt-0.5">
                          {reasonText}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>
                          {new Date(entry.created_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                        {entry.business_date && (
                          <>
                            <span>|</span>
                            <span>For: {entry.business_date}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {category}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && changes.length > 0 && (
            <div className="mt-3 pt-3 border-t text-xs text-gray-500">
              These changes are tracked to help the scheduling AI improve over time.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
