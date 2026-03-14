'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingUp,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface Recommendation {
  id: string;
  rec_type: 'covers' | 'pacing' | 'turn_time' | 'channel';
  slot_label: string | null;
  current_value: { value: number };
  recommended_value: { value: number; channelRule?: string };
  reasoning: string;
  expected_impact: { extra_covers?: number; revenue_delta?: number };
  confidence: 'high' | 'medium' | 'low';
  status: string;
  created_at: string;
}

interface RecommendationBannerProps {
  venueId: string;
  date: string;
  onApplied: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function RecommendationBanner({ venueId, date, onApplied }: RecommendationBannerProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [modifying, setModifying] = useState<{ id: string; value: number } | null>(null);

  const fetchRecs = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/recommendations?venue_id=${venueId}&date=${date}`);
      const data = await res.json();
      if (data.success) {
        setRecommendations(data.recommendations || []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [venueId, date]);

  useEffect(() => {
    fetchRecs();
  }, [fetchRecs]);

  const handleAction = async (recId: string, action: 'accept' | 'dismiss', modifiedValue?: number) => {
    setActioning(recId);
    try {
      const res = await fetch('/api/reservations/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendation_id: recId,
          action,
          modified_value: modifiedValue,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setRecommendations(prev => prev.filter(r => r.id !== recId));
        setModifying(null);
        if (action === 'accept') onApplied();
      }
    } catch {
      // Silent fail
    } finally {
      setActioning(null);
    }
  };

  if (loading || recommendations.length === 0) return null;

  const topRec = recommendations[0];
  const totalImpact = recommendations.reduce((s, r) => s + (r.expected_impact.extra_covers || 0), 0);
  const totalRevenue = recommendations.reduce((s, r) => s + (r.expected_impact.revenue_delta || 0), 0);

  return (
    <Card className="mb-4 border-keva-sage-200 bg-keva-sage-50/30">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-keva-sage-600" />
          <span className="font-semibold text-sm">AI Pacing Suggestions</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-keva-sage-500 text-keva-sage-700">
            {recommendations.length} suggestion{recommendations.length > 1 ? 's' : ''}
          </Badge>
          {totalImpact > 0 && (
            <span className="text-xs text-keva-sage-600 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +{totalImpact} covers
              {totalRevenue > 0 && ` · +$${totalRevenue.toLocaleString()}`}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Collapsed preview */}
      {!expanded && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs text-muted-foreground line-clamp-2">{topRec.reasoning}</p>
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-keva-sage-100 pt-3 space-y-3">
          {recommendations.map(rec => (
            <div key={rec.id} className="bg-white rounded-lg p-3 border border-border space-y-2">
              {/* Rec header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 uppercase ${rec.rec_type === 'channel' ? 'border-violet-500 text-violet-600' : ''}`}>
                      {rec.rec_type === 'covers' ? 'Covers/Interval' :
                       rec.rec_type === 'pacing' ? `Slot: ${rec.slot_label}` :
                       rec.rec_type === 'channel' ? `Channel: ${rec.recommended_value.channelRule || rec.slot_label || 'Allocation'}` :
                       `Turn Time: ${rec.slot_label || 'Default'}`}
                    </Badge>
                    <ConfidenceBadge confidence={rec.confidence} />
                  </div>
                  <p className="text-sm">{rec.reasoning}</p>
                </div>
              </div>

              {/* Value change */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{rec.current_value.value}</span>
                <span className="text-muted-foreground">→</span>
                {modifying?.id === rec.id ? (
                  <input
                    type="number"
                    value={modifying.value}
                    onChange={e => setModifying({ id: rec.id, value: parseInt(e.target.value) || 0 })}
                    className="w-20 p-1 text-sm text-center border border-border rounded bg-background"
                    autoFocus
                  />
                ) : (
                  <span className="font-semibold text-keva-sage-700">{rec.recommended_value.value}</span>
                )}
                {rec.expected_impact.extra_covers ? (
                  <span className="text-xs text-emerald-600 ml-2">
                    +{rec.expected_impact.extra_covers} covers
                    {rec.expected_impact.revenue_delta ? ` · +$${rec.expected_impact.revenue_delta.toLocaleString()}` : ''}
                  </span>
                ) : null}
              </div>

              {/* Channel advisory note */}
              {rec.rec_type === 'channel' && (
                <div className="text-[10px] text-violet-600 bg-violet-50 rounded px-2 py-1">
                  Adjust in SR Admin &gt; Access Rules. API write access pending.
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  size="sm"
                  className={`h-7 text-xs ${rec.rec_type === 'channel' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-keva-sage-600 hover:bg-keva-sage-700'}`}
                  disabled={actioning === rec.id}
                  onClick={() => handleAction(
                    rec.id,
                    'accept',
                    modifying?.id === rec.id ? modifying.value : undefined,
                  )}
                >
                  {actioning === rec.id ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Check className="w-3 h-3 mr-1" />
                  )}
                  {rec.rec_type === 'channel' ? 'Acknowledge' : 'Accept'}
                </Button>
                {!modifying || modifying.id !== rec.id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setModifying({ id: rec.id, value: rec.recommended_value.value })}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> Modify
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setModifying(null)}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  disabled={actioning === rec.id}
                  onClick={() => handleAction(rec.id, 'dismiss')}
                >
                  <X className="w-3 h-3 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'border-emerald-500 text-emerald-600',
    medium: 'border-amber-500 text-amber-600',
    low: 'border-gray-400 text-gray-500',
  };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 uppercase ${styles[confidence]}`}>
      {confidence}
    </Badge>
  );
}
