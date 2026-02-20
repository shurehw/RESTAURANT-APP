'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldAlert,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  AlertCircle,
  Eye,
  CheckCircle,
  Clock,
  UserX,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManagerComparison {
  manager_id: string;
  manager_name: string | null;
  total_attestations: number;
  total_signals: number;
  avg_signals_per_night: number;
  commitments_made: number;
  follow_through_rate: number;
  unique_employees_mentioned: number;
  negative_mention_rate: number;
  top_concern: string | null;
  avg_command_score: number | null;
  avoidance_rate: number;
  corrective_action_rate: number;
}

interface ManagerProfile {
  manager_id: string;
  manager_name: string | null;
  manager_email: string;
  total_attestations: number;
  total_signals: number;
  avg_signals_per_attestation: number;
  employee_mentions: number;
  action_commitments: number;
  operational_issues: number;
  guest_insights: number;
  staffing_signals: number;
  commitments_made: number;
  commitments_fulfilled: number;
  commitments_unfulfilled: number;
  commitments_open: number;
  follow_through_rate: number;
  unique_employees_mentioned: number;
  most_mentioned_employees: Array<{
    name: string;
    count: number;
    positive: number;
    negative: number;
    actionable: number;
  }>;
  positive_mentions: number;
  negative_mentions: number;
  actionable_mentions: number;
  neutral_mentions: number;
  avg_ownership: {
    narrative_depth: number;
    ownership: number;
    variance_awareness: number;
    signal_density: number;
    command_tone: number;
    energy_alignment: number;
    overall_command_score: number;
  } | null;
  ownership_trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  avoidance_rate: number;
  blame_shift_rate: number;
  corrective_action_rate: number;
  variance_awareness_rate: number;
  first_attestation: string;
  last_attestation: string;
}

interface IntelligenceItem {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  intelligence_type: string;
  severity: string;
  title: string;
  description: string;
  recommended_action: string | null;
  subject_manager_name: string | null;
  related_employees: string[];
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ManagerIntelligencePage() {
  const supabase = useMemo(() => createClient(), []);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [managers, setManagers] = useState<ManagerComparison[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceItem[]>([]);
  const [selectedManager, setSelectedManager] = useState<ManagerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get auth token for API calls
  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    };
  }, [supabase]);

  // Bootstrap: get org_id and venues
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgUser } = await supabase
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (orgUser) {
        setOrgId(orgUser.organization_id);

        const { data: v } = await supabase
          .from('venues')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        setVenues(v || []);
        if (v && v.length > 0) {
          setVenueId(v[0].id);
        }
      }
    }
    init();
  }, [supabase]);

  // Fetch data when org/venue changes
  useEffect(() => {
    if (!orgId) return;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();

        // Fetch in parallel: manager comparison + active intelligence
        const params = new URLSearchParams({ org_id: orgId! });
        if (venueId) params.set('venue_id', venueId);

        const compareParams = new URLSearchParams({ org_id: orgId!, mode: 'compare', days: '90' });
        if (venueId) compareParams.set('venue_id', venueId);

        const [compRes, intelRes] = await Promise.all([
          venueId
            ? fetch(`/api/attestation/signals/analytics?${compareParams}`, { headers })
            : Promise.resolve(null),
          fetch(`/api/operator/intelligence?${params}`, { headers }),
        ]);

        if (compRes && compRes.ok) {
          const compData = await compRes.json();
          setManagers(compData.managers || []);
        }

        if (intelRes.ok) {
          const intelData = await intelRes.json();
          setIntelligence(intelData.items || []);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, venueId, getAuthHeaders]);

  // Fetch individual manager profile
  async function loadManagerProfile(managerId: string) {
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        org_id: orgId!,
        mode: 'profile',
        manager_id: managerId,
        days: '90',
      });
      if (venueId) params.set('venue_id', venueId);

      const res = await fetch(`/api/attestation/signals/analytics?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedManager(data.profile);
      }
    } catch {
      // Fail silently — user can try again
    }
  }

  // Handle intelligence action
  async function handleAction(id: string, action: 'resolve' | 'dismiss') {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/operator/intelligence', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, action, org_id: orgId }),
      });
      if (res.ok) {
        setIntelligence(prev => prev.filter(i => i.id !== id));
      }
    } catch {
      // Fail silently
    }
  }

  if (loading && !orgId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-brass" />
          <div>
            <h1 className="text-2xl font-bold">Manager Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Internal operator view — not visible to managers
            </p>
          </div>
        </div>

        {/* Venue filter */}
        {venues.length > 1 && (
          <select
            value={venueId || ''}
            onChange={(e) => {
              setVenueId(e.target.value || null);
              setSelectedManager(null);
            }}
            className="px-3 py-2 border rounded-md text-sm bg-background"
          >
            {venues.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md p-3">
          {error}
        </div>
      )}

      {/* Selected Manager Profile */}
      {selectedManager ? (
        <ManagerProfileView
          profile={selectedManager}
          onBack={() => setSelectedManager(null)}
        />
      ) : (
        <>
          {/* Active Intelligence Items */}
          {intelligence.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Active Intelligence ({intelligence.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {intelligence.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-start justify-between gap-3 p-3 rounded-md border ${
                        item.severity === 'critical'
                          ? 'border-l-4 border-l-red-500 bg-red-50/50'
                          : item.severity === 'warning'
                            ? 'border-l-4 border-l-yellow-500 bg-yellow-50/50'
                            : 'border-l-4 border-l-blue-500 bg-blue-50/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.intelligence_type === 'unfulfilled_commitment' && (
                            <Clock className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                          )}
                          {item.intelligence_type === 'employee_pattern' && (
                            <UserX className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          )}
                          {item.intelligence_type === 'ownership_alert' && (
                            <ShieldAlert className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                          )}
                          <span className="text-sm font-medium">{item.title}</span>
                          {item.subject_manager_name && (
                            <Badge variant="outline" className="text-[10px]">
                              {item.subject_manager_name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleAction(item.id, 'resolve')}
                          className="p-1 rounded hover:bg-sage/10 text-sage"
                          title="Resolve"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleAction(item.id, 'dismiss')}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title="Dismiss"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manager Comparison Table */}
          {managers.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Manager Comparison (90-day)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium">Manager</th>
                        <th className="pb-2 pr-4 font-medium text-center">Nights</th>
                        <th className="pb-2 pr-4 font-medium text-center">Command</th>
                        <th className="pb-2 pr-4 font-medium text-center">Follow-Through</th>
                        <th className="pb-2 pr-4 font-medium text-center">Avoidance</th>
                        <th className="pb-2 pr-4 font-medium text-center">Signals/Night</th>
                        <th className="pb-2 pr-4 font-medium text-center">Concern</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managers.map(mgr => (
                        <tr
                          key={mgr.manager_id}
                          className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                          onClick={() => loadManagerProfile(mgr.manager_id)}
                        >
                          <td className="py-3 pr-4 font-medium">
                            {mgr.manager_name || 'Unknown'}
                          </td>
                          <td className="py-3 pr-4 text-center text-muted-foreground">
                            {mgr.total_attestations}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.avg_command_score != null ? (
                              <CommandScoreBadge score={mgr.avg_command_score} />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.commitments_made > 0 ? (
                              <span className={mgr.follow_through_rate >= 0.7 ? 'text-green-600' : mgr.follow_through_rate >= 0.4 ? 'text-yellow-600' : 'text-red-600'}>
                                {Math.round(mgr.follow_through_rate * 100)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.avoidance_rate > 0 ? (
                              <span className={mgr.avoidance_rate >= 0.3 ? 'text-red-600' : 'text-yellow-600'}>
                                {Math.round(mgr.avoidance_rate * 100)}%
                              </span>
                            ) : (
                              <span className="text-green-600">0%</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-center text-muted-foreground">
                            {mgr.avg_signals_per_night.toFixed(1)}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {mgr.top_concern ? (
                              <Badge variant="error" className="text-[10px]">
                                {mgr.top_concern}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : !loading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>{venueId ? 'No attestation data for this venue yet' : 'Select a venue to compare managers'}</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command Score Badge
// ---------------------------------------------------------------------------

function CommandScoreBadge({ score }: { score: number }) {
  const color = score >= 7
    ? 'bg-green-100 text-green-700 border-green-200'
    : score >= 4
      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
      : 'bg-red-100 text-red-700 border-red-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Manager Profile View
// ---------------------------------------------------------------------------

function ManagerProfileView({
  profile,
  onBack,
}: {
  profile: ManagerProfile;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to comparison
      </button>

      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-brass/20 text-brass flex items-center justify-center text-lg font-bold">
          {(profile.manager_name || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-bold">{profile.manager_name || 'Unknown Manager'}</h2>
          <p className="text-sm text-muted-foreground">
            {profile.total_attestations} attestations &middot; {profile.first_attestation} to {profile.last_attestation}
          </p>
        </div>
        {profile.ownership_trend !== 'insufficient_data' && (
          <div className="ml-auto flex items-center gap-1 text-sm">
            {profile.ownership_trend === 'improving' && (
              <>
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-green-600">Improving</span>
              </>
            )}
            {profile.ownership_trend === 'declining' && (
              <>
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-red-600">Declining</span>
              </>
            )}
            {profile.ownership_trend === 'stable' && (
              <>
                <Minus className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Stable</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Ownership Scorecard */}
      {profile.avg_ownership && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ownership Scorecard</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ScoreCell label="Command Score" value={profile.avg_ownership.overall_command_score} max={10} />
              <ScoreCell label="Narrative Depth" value={profile.avg_ownership.narrative_depth} max={10} />
              <ScoreCell label="Ownership" value={profile.avg_ownership.ownership} max={10} />
              <ScoreCell label="Variance Awareness" value={profile.avg_ownership.variance_awareness} max={10} />
              <ScoreCell label="Signal Density" value={profile.avg_ownership.signal_density} max={10} />
              <ScoreCell label="Command Tone" value={profile.avg_ownership.command_tone} max={10} />
              <ScoreCell label="Energy Alignment" value={profile.avg_ownership.energy_alignment} max={10} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Behavior Flags */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlagCard
          label="Follow-Through"
          value={`${Math.round(profile.follow_through_rate * 100)}%`}
          good={profile.follow_through_rate >= 0.7}
          detail={`${profile.commitments_fulfilled} of ${profile.commitments_fulfilled + profile.commitments_unfulfilled} closed`}
        />
        <FlagCard
          label="Avoidance Rate"
          value={`${Math.round(profile.avoidance_rate * 100)}%`}
          good={profile.avoidance_rate < 0.15}
          detail="Attestations with vague/avoidant language"
        />
        <FlagCard
          label="Blame Shifting"
          value={`${Math.round(profile.blame_shift_rate * 100)}%`}
          good={profile.blame_shift_rate < 0.15}
          detail="Attestations attributing to external factors"
        />
        <FlagCard
          label="Corrective Action"
          value={`${Math.round(profile.corrective_action_rate * 100)}%`}
          good={profile.corrective_action_rate >= 0.5}
          detail="Attestations with real-time corrections"
        />
      </div>

      {/* Signal Volume */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Signal Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{profile.total_signals}</div>
              <div className="text-xs text-muted-foreground">Total Signals</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{profile.employee_mentions}</div>
              <div className="text-xs text-muted-foreground">Employee Mentions</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{profile.action_commitments}</div>
              <div className="text-xs text-muted-foreground">Commitments</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{profile.operational_issues}</div>
              <div className="text-xs text-muted-foreground">Ops Issues</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{profile.guest_insights}</div>
              <div className="text-xs text-muted-foreground">Guest Insights</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{profile.staffing_signals}</div>
              <div className="text-xs text-muted-foreground">Staffing</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employee Mentions */}
      {profile.most_mentioned_employees.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Employee Mention Patterns ({profile.unique_employees_mentioned} unique)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium text-center">Total</th>
                    <th className="pb-2 pr-4 font-medium text-center">Positive</th>
                    <th className="pb-2 pr-4 font-medium text-center">Negative</th>
                    <th className="pb-2 pr-4 font-medium text-center">Actionable</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.most_mentioned_employees.map(emp => (
                    <tr key={emp.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 capitalize">{emp.name}</td>
                      <td className="py-2 pr-4 text-center">{emp.count}</td>
                      <td className="py-2 pr-4 text-center text-green-600">{emp.positive}</td>
                      <td className="py-2 pr-4 text-center text-red-600">{emp.negative}</td>
                      <td className="py-2 pr-4 text-center text-yellow-600">{emp.actionable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commitment Tracking */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Commitment Accountability</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{profile.commitments_made}</div>
              <div className="text-xs text-muted-foreground">Made</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{profile.commitments_fulfilled}</div>
              <div className="text-xs text-muted-foreground">Fulfilled</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{profile.commitments_unfulfilled}</div>
              <div className="text-xs text-muted-foreground">Unfulfilled</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{profile.commitments_open}</div>
              <div className="text-xs text-muted-foreground">Open</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Cell
// ---------------------------------------------------------------------------

function ScoreCell({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flag Card
// ---------------------------------------------------------------------------

function FlagCard({
  label,
  value,
  good,
  detail,
}: {
  label: string;
  value: string;
  good: boolean;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className={`text-2xl font-bold ${good ? 'text-green-600' : 'text-red-600'}`}>
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">{detail}</div>
      </CardContent>
    </Card>
  );
}
