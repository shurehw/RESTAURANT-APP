'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useVenue } from '@/components/providers/VenueProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentAtTable } from '@/components/rez-yield/AgentAtTable';
import {
  Brain,
  Activity,
  Shield,
  Zap,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
  Radio,
  Eye,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface SlotData {
  slot: string;
  protection_score: number;
  aggressiveness_score: number;
  fill_risk_score: number;
  future_opportunity_score: number;
  recommended_action: string;
  stress_score: number;
}

interface PostureData {
  posture: string;
  confidence: string;
  slots: SlotData[];
  summary: string;
  metrics: {
    pickup_vs_pace: number;
    fill_pct: number;
    denied_demand_ratio: number;
    walk_in_pressure: number;
    peak_stress: number;
  };
  demand: {
    strength: string;
    expected_covers: number;
    walk_in_expected: number;
    sellout_probability: number;
    pickup_pace_ratio: number;
  };
  policy: {
    active_tier: string;
    stress_score_max: number;
  };
  elapsed_ms: number;
}

interface SimulatedEval {
  id: number;
  party_size: number;
  time: string;
  is_vip: boolean;
  channel: string;
  recommendation: string;
  confidence: number;
  accept_value: number;
  hold_value: number;
  risk_band: string;
  reasoning: string;
  state: 'thinking' | 'forecasting' | 'scoring' | 'decided';
  timestamp: Date;
}

// ── Simulated evaluation generator ─────────────────────────

const CHANNELS = ['direct', 'phone', 'concierge', 'opentable', 'resy'];
const TIMES = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];

function generateEval(id: number, posture: PostureData | null): SimulatedEval {
  const partySize = Math.round(2 + Math.random() * 6);
  const time = TIMES[Math.floor(Math.random() * TIMES.length)];
  const isVip = Math.random() < 0.12;
  const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];

  // Decision weighted by posture
  const postureStr = posture?.posture || 'balanced';
  let r = Math.random();
  let recommendation: string;
  if (postureStr === 'aggressive' || postureStr === 'open') {
    recommendation = r < 0.7 ? 'accept' : r < 0.85 ? 'offer_alternate' : r < 0.95 ? 'waitlist' : 'deny';
  } else if (postureStr === 'protected' || postureStr === 'highly_protected') {
    recommendation = r < 0.35 ? 'accept' : r < 0.55 ? 'offer_alternate' : r < 0.85 ? 'waitlist' : 'deny';
  } else {
    recommendation = r < 0.5 ? 'accept' : r < 0.7 ? 'offer_alternate' : r < 0.9 ? 'waitlist' : 'deny';
  }

  if (isVip && recommendation === 'deny') recommendation = 'waitlist';

  const confidence = 0.4 + Math.random() * 0.55;
  const acceptValue = Math.round(80 + Math.random() * 400);
  const holdValue = Math.round(40 + Math.random() * 300);

  const reasonings: Record<string, string[]> = {
    accept: [
      'Strong value signal — accept value exceeds hold by wide margin.',
      'Open posture, low stress. Good capacity fit.',
      'Revenue-positive. No blocking impact detected.',
    ],
    offer_alternate: [
      'Requested slot protected. 19:30 or 20:00 offers better fit.',
      'Dead gap risk at requested time. Earlier slot preserves second turn.',
      'Better table availability at adjacent time. Guest experience improves.',
    ],
    waitlist: [
      'Service stress elevated. Waitlist to protect kitchen throughput.',
      'Protection score 78% — holding for higher-value booking.',
      'No-show risk above threshold without deposit.',
    ],
    deny: [
      'Hold value significantly exceeds accept. Slot reserved for walk-in demand.',
      'Capacity buffer below minimum for prime slot.',
      'Stress ceiling reached. Service quality at risk.',
    ],
  };

  const reasons = reasonings[recommendation] || reasonings.accept;
  const reasoning = reasons[Math.floor(Math.random() * reasons.length)];

  return {
    id,
    party_size: partySize,
    time,
    is_vip: isVip,
    channel,
    recommendation,
    confidence,
    accept_value: acceptValue,
    hold_value: holdValue,
    risk_band: confidence > 0.75 ? 'low' : confidence > 0.6 ? 'medium' : 'high',
    reasoning,
    state: 'thinking',
    timestamp: new Date(),
  };
}

// ── Page ───────────────────────────────────────────────────

export default function RezYieldAgentLivePage() {
  const { selectedVenue } = useVenue();
  const [posture, setPosture] = useState<PostureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [evals, setEvals] = useState<SimulatedEval[]>([]);
  const [evalCounter, setEvalCounter] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const evalCounterRef = useRef(0);

  const venueId = selectedVenue?.id && selectedVenue.id !== 'all'
    ? selectedVenue.id
    : null;

  // Fetch real posture data
  const fetchPosture = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/rez-yield/posture?venue_id=${venueId}&date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setPosture(data);
      }
    } catch (err) {
      console.error('[agent-live] posture fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    fetchPosture();
  }, [fetchPosture]);

  // Simulate incoming reservation evaluations
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      evalCounterRef.current += 1;
      const newEval = generateEval(evalCounterRef.current, posture);
      setEvals((prev) => [newEval, ...prev].slice(0, 15));

      // Animate through states
      setTimeout(() => {
        setEvals((prev) =>
          prev.map((e) => (e.id === newEval.id ? { ...e, state: 'forecasting' } : e)),
        );
      }, 600);
      setTimeout(() => {
        setEvals((prev) =>
          prev.map((e) => (e.id === newEval.id ? { ...e, state: 'scoring' } : e)),
        );
      }, 1400);
      setTimeout(() => {
        setEvals((prev) =>
          prev.map((e) => (e.id === newEval.id ? { ...e, state: 'decided' } : e)),
        );
      }, 2200);
    }, 3500);

    return () => clearInterval(interval);
  }, [isRunning, posture]);

  // ── Posture color ──
  const postureColors: Record<string, string> = {
    aggressive: 'text-red-500',
    open: 'text-emerald-500',
    balanced: 'text-blue-500',
    protected: 'text-amber-500',
    highly_protected: 'text-red-600',
  };

  const postureBg: Record<string, string> = {
    aggressive: 'bg-red-500',
    open: 'bg-emerald-500',
    balanced: 'bg-blue-500',
    protected: 'bg-amber-500',
    highly_protected: 'bg-red-600',
  };

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            {isRunning && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Revenue Agent — Live Demo</h1>
            <p className="text-sm text-muted-foreground">
              Posture metrics are live; the decision feed below is simulated for demo visualization
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={isRunning
              ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              : 'bg-muted text-muted-foreground'}
          >
            <Radio className="h-3 w-3 mr-1" />
            {isRunning ? 'SIMULATED' : 'PAUSED'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      {!venueId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Eye className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Select a venue</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Choose a specific venue from the sidebar to watch the agent work.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          {/* Left: Main feed */}
          <div className="space-y-4">
            {/* Posture Banner */}
            <Card className="overflow-hidden">
              <div className={`h-1 ${postureBg[posture?.posture || 'balanced']}`} />
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Service Posture</p>
                      <p className={`text-2xl font-bold capitalize ${postureColors[posture?.posture || 'balanced']}`}>
                        {loading ? '...' : (posture?.posture || 'balanced').replace('_', ' ')}
                      </p>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <MiniStat label="Fill" value={`${Math.round((posture?.metrics.fill_pct || 0) * 100)}%`} />
                      <MiniStat label="Pace" value={`${Math.round((posture?.metrics.pickup_vs_pace || 1) * 100)}%`} />
                      <MiniStat label="Stress" value={`${Math.round(posture?.metrics.peak_stress || 0)}`} />
                      <MiniStat label="Covers" value={`${posture?.demand.expected_covers || '—'}`} />
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {posture?.demand.strength || 'moderate'} demand
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Slot Heatmap */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Slot Protection Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-1">
                  {(posture?.slots || []).slice(0, 24).map((slot) => (
                    <SlotCell key={slot.slot} slot={slot} />
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500/60" /> Release</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500/60" /> Hold</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500/60" /> Protect</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/60" /> Closed</span>
                  </div>
                  <span>{posture?.slots.length || 0} slots tracked</span>
                </div>
              </CardContent>
            </Card>

            {/* Live Decision Feed */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Decision Feed (Simulated)
                  {isRunning && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {evals.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Waiting for incoming requests...
                    </p>
                  ) : (
                    evals.map((ev) => <EvalCard key={ev.id} ev={ev} />)
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Agent Status Panel */}
          <div className="space-y-4">
            {/* Agent Animation */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <AgentAtTable className="w-full h-48" />
              </CardContent>
            </Card>

            {/* Agent Brain */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Agent Status</span>
                </div>
                <div className="space-y-3 text-xs">
                  <StatusRow label="Policy" value="rez-agent-v1" />
                  <StatusRow label="Tier" value="0 — Advice Only" badge />
                  <StatusRow label="Auto-Execute" value="Disabled" />
                  <StatusRow label="Exploration" value="5% traffic" />
                  <div className="border-t pt-2 mt-2">
                    <p className="text-muted-foreground font-medium mb-1">Hard Constraints</p>
                    <StatusRow label="Max Stress" value={`${posture?.policy.stress_score_max || 82}`} />
                    <StatusRow label="VIP Auto-Deny" value="Never" />
                    <StatusRow label="Min Confidence" value="40%" />
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <p className="text-muted-foreground font-medium mb-1">Objective Weights</p>
                    <WeightBar label="Revenue" pct={45} />
                    <WeightBar label="Service Quality" pct={25} />
                    <WeightBar label="Optionality" pct={15} />
                    <WeightBar label="Guest Relationship" pct={10} />
                    <WeightBar label="Fairness" pct={5} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Counters */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Session Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <LiveCounter
                    label="Evaluated"
                    value={evals.length}
                    icon={<Activity className="h-3.5 w-3.5" />}
                  />
                  <LiveCounter
                    label="Accepted"
                    value={evals.filter((e) => e.state === 'decided' && e.recommendation === 'accept').length}
                    icon={<CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                  />
                  <LiveCounter
                    label="Redirected"
                    value={evals.filter((e) => e.state === 'decided' && e.recommendation === 'offer_alternate').length}
                    icon={<ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />}
                  />
                  <LiveCounter
                    label="Held"
                    value={evals.filter((e) => e.state === 'decided' && (e.recommendation === 'waitlist' || e.recommendation === 'deny')).length}
                    icon={<Shield className="h-3.5 w-3.5 text-amber-500" />}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Model Pipeline */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Model Pipeline</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {[
                    { name: 'Demand Forecast', status: 'active' },
                    { name: 'Duration Model', status: 'active' },
                    { name: 'Show/No-Show', status: 'active' },
                    { name: 'Spend Predictor', status: 'active' },
                    { name: 'Walk-in Pressure', status: 'active' },
                    { name: 'Stress Forecast', status: 'active' },
                  ].map((model) => (
                    <div key={model.name} className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground">{model.name}</span>
                      <span className="flex items-center gap-1 text-emerald-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        online
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SlotCell({ slot }: { slot: SlotData }) {
  const actionColors: Record<string, string> = {
    release: 'bg-emerald-500/60 hover:bg-emerald-500/80',
    hold: 'bg-blue-500/60 hover:bg-blue-500/80',
    protect: 'bg-amber-500/60 hover:bg-amber-500/80',
    close: 'bg-red-500/60 hover:bg-red-500/80',
  };

  return (
    <div
      className={`rounded-sm h-8 flex items-end justify-center transition-colors cursor-default ${actionColors[slot.recommended_action] || 'bg-muted'}`}
      title={`${slot.slot} — ${slot.recommended_action} (protection: ${slot.protection_score}, stress: ${slot.stress_score})`}
    >
      <span className="text-[9px] font-mono text-white/80 pb-0.5">
        {slot.slot.slice(0, 5)}
      </span>
    </div>
  );
}

function EvalCard({ ev }: { ev: SimulatedEval }) {
  const stateLabel: Record<string, string> = {
    thinking: 'Receiving request...',
    forecasting: 'Running 6 forecast models...',
    scoring: 'Computing value & blocking impact...',
    decided: '',
  };

  const recIcon: Record<string, React.ReactNode> = {
    accept: <CheckCircle className="h-4 w-4 text-emerald-500" />,
    offer_alternate: <ArrowUpRight className="h-4 w-4 text-blue-500" />,
    waitlist: <Clock className="h-4 w-4 text-amber-500" />,
    deny: <XCircle className="h-4 w-4 text-red-500" />,
  };

  const recBorder: Record<string, string> = {
    accept: 'border-emerald-500/30',
    offer_alternate: 'border-blue-500/30',
    waitlist: 'border-amber-500/30',
    deny: 'border-red-500/30',
  };

  const isProcessing = ev.state !== 'decided';

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-500 ${
        isProcessing
          ? 'border-primary/30 bg-primary/5'
          : recBorder[ev.recommendation] || 'border-border'
      }`}
    >
      {isProcessing ? (
        <div className="flex items-center gap-3">
          <div className="relative">
            <Brain className="h-5 w-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {ev.party_size}pax @ {ev.time}
                {ev.is_vip && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">VIP</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">via {ev.channel}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span className="text-xs text-primary animate-pulse">{stateLabel[ev.state]}</span>
            </div>
            {/* Progress bar */}
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-700"
                style={{
                  width: ev.state === 'thinking' ? '20%' : ev.state === 'forecasting' ? '55%' : '85%',
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          {recIcon[ev.recommendation]}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium capitalize">
                {ev.recommendation.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-muted-foreground">
                {ev.party_size}pax @ {ev.time}
                {ev.is_vip && ' VIP'}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ml-auto shrink-0 ${
                  ev.risk_band === 'low'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : ev.risk_band === 'medium'
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : 'bg-red-500/10 text-red-600 border-red-500/20'
                }`}
              >
                {ev.risk_band}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{ev.reasoning}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="tabular-nums">Accept: ${ev.accept_value}</span>
              <span className="tabular-nums">Hold: ${ev.hold_value}</span>
              <span className="tabular-nums">Conf: {Math.round(ev.confidence * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
          {value}
        </Badge>
      ) : (
        <span className="font-medium tabular-nums">{value}</span>
      )}
    </div>
  );
}

function WeightBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/40 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums w-8 text-right text-muted-foreground">{pct}%</span>
    </div>
  );
}

function LiveCounter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {icon}
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
