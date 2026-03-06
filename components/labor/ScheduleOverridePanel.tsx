'use client';

/**
 * Admin Override Panel for Schedule Page
 * Allows admins to set start_time, end_time, CPLH, min/max staff, bar_guest_pct per position.
 * When overrides are set, the scheduler uses them instead of auto-calculated values.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface PositionOverride {
  position_name: string;
  shift_start: string;
  shift_end: string;
  min_shift_hours: number;
  cplh_override: string;
  min_staff: string;
  max_staff: string;
  bar_guest_pct: string;
  is_dirty: boolean;
}

const DEFAULT_POSITIONS = [
  { name: 'Server',           category: 'FOH' },
  { name: 'Bartender',        category: 'FOH' },
  { name: 'Busser',           category: 'FOH' },
  { name: 'Food Runner',      category: 'FOH' },
  { name: 'Host',             category: 'FOH' },
  { name: 'Line Cook',        category: 'BOH' },
  { name: 'Prep Cook',        category: 'BOH' },
  { name: 'Dishwasher',       category: 'BOH' },
  { name: 'Sous Chef',        category: 'MGT' },
  { name: 'Executive Chef',   category: 'MGT' },
  { name: 'General Manager',  category: 'MGT' },
  { name: 'Assistant Manager', category: 'MGT' },
  { name: 'Shift Manager',    category: 'MGT' },
];

function emptyOverride(posName: string): PositionOverride {
  return {
    position_name: posName,
    shift_start: '',
    shift_end: '',
    min_shift_hours: 6,
    cplh_override: '',
    min_staff: '',
    max_staff: '',
    bar_guest_pct: '',
    is_dirty: false,
  };
}

interface Props {
  venueId: string;
}

export function ScheduleOverridePanel({ venueId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [overrides, setOverrides] = useState<PositionOverride[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadOverrides = useCallback(async () => {
    try {
      const res = await fetch(`/api/labor/schedule/overrides?venue_id=${venueId}`);
      const json = await res.json();

      const saved: Record<string, any> = {};
      if (json.data) {
        for (const row of json.data) {
          saved[row.position_name] = row;
        }
      }

      const merged = DEFAULT_POSITIONS.map(pos => {
        const existing = saved[pos.name];
        if (existing) {
          return {
            position_name: pos.name,
            shift_start: existing.shift_start || '',
            shift_end: existing.shift_end || '',
            min_shift_hours: existing.min_shift_hours ?? 6,
            cplh_override: existing.cplh_override?.toString() || '',
            min_staff: existing.min_staff?.toString() || '',
            max_staff: existing.max_staff?.toString() || '',
            bar_guest_pct: existing.bar_guest_pct?.toString() || '',
            is_dirty: false,
          };
        }
        return emptyOverride(pos.name);
      });

      setOverrides(merged);
      setLoaded(true);
    } catch {
      // Table may not exist yet — just show empty form
      setOverrides(DEFAULT_POSITIONS.map(pos => emptyOverride(pos.name)));
      setLoaded(true);
    }
  }, [venueId]);

  useEffect(() => {
    if (expanded && !loaded) {
      loadOverrides();
    }
  }, [expanded, loaded, loadOverrides]);

  // Reset when venue changes
  useEffect(() => {
    setLoaded(false);
    setOverrides([]);
  }, [venueId]);

  const updateField = (idx: number, field: keyof PositionOverride, value: string | number) => {
    setOverrides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value, is_dirty: true };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dirtyOverrides = overrides
        .filter(o => o.is_dirty)
        .map(o => ({
          venue_id: venueId,
          position_name: o.position_name,
          shift_start: o.shift_start || null,
          shift_end: o.shift_end || null,
          min_shift_hours: o.min_shift_hours || 6,
          cplh_override: o.cplh_override ? parseFloat(o.cplh_override) : null,
          min_staff: o.min_staff ? parseInt(o.min_staff, 10) : 0,
          max_staff: o.max_staff ? parseInt(o.max_staff, 10) : null,
          bar_guest_pct: o.bar_guest_pct ? parseFloat(o.bar_guest_pct) : 0,
          is_active: true,
        }));

      if (dirtyOverrides.length === 0) {
        toast.info('No changes to save');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/labor/schedule/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: dirtyOverrides }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }

      toast.success(`Saved ${dirtyOverrides.length} position override(s)`);
      setOverrides(prev => prev.map(o => ({ ...o, is_dirty: false })));
    } catch (err: any) {
      toast.error(err.message || 'Failed to save overrides');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (posName: string) => {
    try {
      const res = await fetch(
        `/api/labor/schedule/overrides?venue_id=${venueId}&position_name=${encodeURIComponent(posName)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        setOverrides(prev =>
          prev.map(o => o.position_name === posName ? emptyOverride(posName) : o),
        );
        toast.success(`Cleared override for ${posName}`);
      }
    } catch {
      toast.error('Failed to clear override');
    }
  };

  const hasAnyOverride = overrides.some(o =>
    o.shift_start || o.shift_end || o.cplh_override || o.min_staff || o.max_staff || o.bar_guest_pct,
  );
  const hasDirty = overrides.some(o => o.is_dirty);

  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-[#FF5A1F]" />
          <span className="font-semibold text-white">Position Overrides</span>
          {hasAnyOverride && (
            <Badge className="bg-[#FF5A1F]/20 text-[#FF5A1F] border-[#FF5A1F]/30 text-xs">
              Active
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-xs text-slate-400">
            Override shift times, CPLH, and staffing limits per position. Leave blank to use auto-calculated values.
          </p>

          {/* Table header */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-2 px-1 w-32">Position</th>
                  <th className="text-center py-2 px-1 w-20">Start</th>
                  <th className="text-center py-2 px-1 w-20">End</th>
                  <th className="text-center py-2 px-1 w-16">CPLH</th>
                  <th className="text-center py-2 px-1 w-14">Min</th>
                  <th className="text-center py-2 px-1 w-14">Max</th>
                  <th className="text-center py-2 px-1 w-16">Bar %</th>
                  <th className="text-center py-2 px-1 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((override, idx) => {
                  const pos = DEFAULT_POSITIONS[idx];
                  const catColor = pos.category === 'FOH' ? 'text-emerald-400'
                    : pos.category === 'BOH' ? 'text-amber-400' : 'text-blue-400';
                  const hasValues = override.shift_start || override.shift_end ||
                    override.cplh_override || override.min_staff || override.max_staff || override.bar_guest_pct;

                  return (
                    <tr
                      key={override.position_name}
                      className={`border-b border-slate-700/50 ${override.is_dirty ? 'bg-[#FF5A1F]/5' : ''} ${hasValues ? 'bg-slate-700/20' : ''}`}
                    >
                      <td className="py-1.5 px-1">
                        <span className={`font-medium ${catColor}`}>{override.position_name}</span>
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="time"
                          value={override.shift_start}
                          onChange={e => updateField(idx, 'shift_start', e.target.value)}
                          className="w-full bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-center text-xs focus:border-[#FF5A1F] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="time"
                          value={override.shift_end}
                          onChange={e => updateField(idx, 'shift_end', e.target.value)}
                          className="w-full bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-center text-xs focus:border-[#FF5A1F] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          placeholder="—"
                          value={override.cplh_override}
                          onChange={e => updateField(idx, 'cplh_override', e.target.value)}
                          className="w-full bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-center text-xs focus:border-[#FF5A1F] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          value={override.min_staff}
                          onChange={e => updateField(idx, 'min_staff', e.target.value)}
                          className="w-full bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-center text-xs focus:border-[#FF5A1F] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          value={override.max_staff}
                          onChange={e => updateField(idx, 'max_staff', e.target.value)}
                          className="w-full bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-center text-xs focus:border-[#FF5A1F] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          placeholder="—"
                          value={override.bar_guest_pct}
                          onChange={e => updateField(idx, 'bar_guest_pct', e.target.value)}
                          className="w-full bg-slate-700/50 border border-slate-600 rounded px-1 py-0.5 text-white text-center text-xs focus:border-[#FF5A1F] focus:outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        {hasValues && (
                          <button
                            onClick={() => handleClear(override.position_name)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                            title="Clear override"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[10px] text-slate-500">
              Bar % = fraction of dining covers who are bar-only guests (e.g. 0.15 = 15%)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadOverrides}
                className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reload
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !hasDirty}
                className="bg-[#FF5A1F] hover:bg-[#FF5A1F]/80 text-white text-xs"
              >
                <Save className="h-3 w-3 mr-1" />
                {saving ? 'Saving...' : 'Save Overrides'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
