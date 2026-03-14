'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Users,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface PacingOverrides {
  covers_per_interval: number | null;
  custom_pacing: Record<string, number>;
  interval_minutes: number | null;
  turn_time_overrides: Record<string, number>;
}

interface SRShift {
  name: string;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  covers_per_seating_interval: number;
  custom_pacing: Record<string, number>;
  duration_minutes_by_party_size: Record<string, number>;
}

interface OutlookData {
  shiftDataSource: 'sevenrooms' | 'historical';
  summary: {
    shiftName: string | null;
    coversPerInterval: number | null;
    intervalMinutes: number | null;
  };
  slots: Array<{
    label: string;
    pacingLimit: number | null;
  }>;
}

interface PacingControlPanelProps {
  venueId: string;
  outlook: OutlookData;
  onSaved: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function PacingControlPanel({ venueId, outlook, onSaved }: PacingControlPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Live SR shifts for reference
  const [liveShifts, setLiveShifts] = useState<SRShift[] | null>(null);

  // Editable overrides
  const [overrides, setOverrides] = useState<PacingOverrides>({
    covers_per_interval: null,
    custom_pacing: {},
    interval_minutes: null,
    turn_time_overrides: {},
  });

  // Track if user has made changes
  const [hasChanges, setHasChanges] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/sevenrooms?venue_id=${venueId}`);
      const data = await res.json();
      if (data.success) {
        if (data.settings) {
          setOverrides({
            covers_per_interval: data.settings.covers_per_interval,
            custom_pacing: data.settings.custom_pacing || {},
            interval_minutes: data.settings.interval_minutes,
            turn_time_overrides: data.settings.turn_time_overrides || {},
          });
        }
        if (data.liveShifts) {
          setLiveShifts(data.liveShifts);
        }
      }
    } catch {
      // Silent fail — panel is optional
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (expanded) loadSettings();
  }, [expanded, loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Clean empty values
      const cleanPacing = Object.fromEntries(
        Object.entries(overrides.custom_pacing).filter(([, v]) => v > 0)
      );
      const cleanTurns = Object.fromEntries(
        Object.entries(overrides.turn_time_overrides).filter(([, v]) => v > 0)
      );

      const res = await fetch('/api/integrations/sevenrooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          covers_per_interval: overrides.covers_per_interval || null,
          interval_minutes: overrides.interval_minutes || null,
          custom_pacing: cleanPacing,
          turn_time_overrides: cleanTurns,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'Pacing overrides saved' });
        setHasChanges(false);
        onSaved();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/integrations/sevenrooms/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId }),
      });
      const result = await res.json();
      if (result.status === 'unsupported') {
        setMessage({ type: 'info', text: 'SR write API not available — overrides are KevaOS-authoritative' });
      } else if (result.status === 'success') {
        setMessage({ type: 'success', text: 'Settings pushed to SevenRooms' });
      } else {
        setMessage({ type: 'error', text: result.message || 'Sync failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSyncing(false);
    }
  };

  const updateOverride = <K extends keyof PacingOverrides>(key: K, value: PacingOverrides[K]) => {
    setOverrides(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Get SR defaults for placeholders
  const primaryShift = liveShifts?.[0];
  const srCovers = primaryShift?.covers_per_seating_interval;
  const srInterval = primaryShift?.interval_minutes;
  const srTurns = primaryShift?.duration_minutes_by_party_size || {};

  // Summary line for collapsed state
  const summaryText = outlook.summary.coversPerInterval
    ? `${outlook.summary.coversPerInterval} covers/${outlook.summary.intervalMinutes}min`
    : 'No pacing data';

  return (
    <Card className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-keva-sage-600" />
          <span className="font-semibold text-sm">Adjust Pacing</span>
          {!expanded && (
            <span className="text-xs text-muted-foreground ml-2">{summaryText}</span>
          )}
          {hasChanges && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-500">
              unsaved
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading settings...
            </div>
          ) : (
            <>
              {/* SR Live Reference */}
              {primaryShift && (
                <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                  <div className="font-medium text-muted-foreground mb-1">Live from SevenRooms</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>{primaryShift.name}</span>
                    <span>{srCovers} covers/{srInterval}min</span>
                    {Object.entries(srTurns).length > 0 && (
                      <span>
                        Turns: {Object.entries(srTurns)
                          .filter(([k]) => k !== '-1')
                          .slice(0, 4)
                          .map(([k, v]) => `${k}p:${v}m`)
                          .join(' · ')}
                        {srTurns['-1'] && ` · default:${srTurns['-1']}m`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Covers per Interval */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                  <Users className="w-3.5 h-3.5" /> Covers per Interval
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={overrides.covers_per_interval ?? ''}
                    onChange={e => updateOverride('covers_per_interval', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder={srCovers ? `${srCovers} (SR default)` : 'Not set'}
                    min={1}
                    max={200}
                    className="w-40 p-2 text-sm border border-border rounded-md bg-background"
                  />
                  <span className="text-xs text-muted-foreground">max covers per {overrides.interval_minutes || srInterval || 30}-min slot</span>
                </div>
              </div>

              {/* Interval Minutes */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> Interval (minutes)
                </label>
                <input
                  type="number"
                  value={overrides.interval_minutes ?? ''}
                  onChange={e => updateOverride('interval_minutes', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder={srInterval ? `${srInterval} (SR default)` : '30'}
                  min={10}
                  max={120}
                  step={5}
                  className="w-40 p-2 text-sm border border-border rounded-md bg-background"
                />
              </div>

              {/* Turn Time Overrides */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Turn Time Overrides (minutes)</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {['2', '4', '6', '8', '10', '-1'].map(size => (
                    <div key={size} className="space-y-1">
                      <span className="text-[10px] text-muted-foreground block text-center">
                        {size === '-1' ? 'Default' : `${size}p`}
                      </span>
                      <input
                        type="number"
                        value={overrides.turn_time_overrides[size] ?? ''}
                        onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value) : 0;
                          const next = { ...overrides.turn_time_overrides };
                          if (val > 0) next[size] = val;
                          else delete next[size];
                          updateOverride('turn_time_overrides', next);
                        }}
                        placeholder={srTurns[size] ? `${srTurns[size]}` : '—'}
                        min={30}
                        max={300}
                        step={5}
                        className="w-full p-1.5 text-sm text-center border border-border rounded-md bg-background"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Blank = use SevenRooms default</p>
              </div>

              {/* Custom Slot Pacing */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Custom Slot Pacing</label>
                <div className="space-y-1.5">
                  {outlook.slots.filter(s => s.pacingLimit !== null).slice(0, 8).map(slot => {
                    const slotKey = slot.label.replace(/\s*(AM|PM)$/i, m => m.trim().toLowerCase() === 'pm' ? '' : '').trim();
                    // Convert label like "6:00 PM" to "18:00"
                    const match = slot.label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                    let timeKey = slotKey;
                    if (match) {
                      let h = parseInt(match[1]);
                      const m = match[2];
                      const ap = match[3].toUpperCase();
                      if (ap === 'PM' && h < 12) h += 12;
                      if (ap === 'AM' && h === 12) h = 0;
                      timeKey = `${h}:${m}`;
                    }

                    return (
                      <div key={slot.label} className="flex items-center gap-2">
                        <span className="text-xs w-20 text-muted-foreground">{slot.label}</span>
                        <input
                          type="number"
                          value={overrides.custom_pacing[timeKey] ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value) : 0;
                            const next = { ...overrides.custom_pacing };
                            if (val > 0) next[timeKey] = val;
                            else delete next[timeKey];
                            updateOverride('custom_pacing', next);
                          }}
                          placeholder={slot.pacingLimit ? `${slot.pacingLimit}` : '—'}
                          min={1}
                          max={200}
                          className="w-20 p-1.5 text-sm text-center border border-border rounded-md bg-background"
                        />
                        <span className="text-[10px] text-muted-foreground">covers</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
              {message && (
                <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
                  message.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
                  message.type === 'error' ? 'bg-red-50 text-red-700' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {message.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
                  {message.type === 'error' && <XCircle className="w-4 h-4" />}
                  {message.type === 'info' && <AlertTriangle className="w-4 h-4" />}
                  {message.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="bg-keva-sage-600 hover:bg-keva-sage-700"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save Overrides
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                  Push to SR
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
