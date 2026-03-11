/**
 * Dashboard Landing — Action Queue + Signal Feed + Operator Intelligence
 * Unified action queue merges commitments and violations by urgency.
 * Signal feed shows read-only informational signals from attestations.
 * Owner/admin also see intelligence feed and composite enforcement scores.
 */

import { requireUser } from '@/lib/auth/require-user';
import { getActiveViolations } from '@/lib/database/enforcement';
import { getActiveIntelligence } from '@/lib/database/operator-intelligence';
import { getOrgOpenCommitments } from '@/lib/database/signal-outcomes';
import {
  getOrgRecentSignals,
  getOrgSignalTrend,
  getOrgFollowThroughRates,
  getManagerCommandScoreTrend,
} from '@/lib/database/signal-analytics';
import { IntelligenceFeed } from '@/components/operator/IntelligenceFeed';
import { DisciplineScores } from '@/components/home/DisciplineScores';
import { ActionQueue } from '@/components/home/ActionQueue';
import { SignalFeed } from '@/components/home/SignalFeed';
import { FollowThroughRate } from '@/components/home/FollowThroughRate';
import { CommandScoreTrend } from '@/components/home/CommandScoreTrend';
import { ShieldAlert } from 'lucide-react';
import { getServiceClient } from '@/lib/supabase/service';

export default async function DashboardPage() {
  const { user, profile } = await requireUser();
  const isOperator = profile.role === 'owner' || profile.role === 'admin';
  let currentUserName = user.email || 'Current user';

  try {
    const supabase = getServiceClient() as any;
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    currentUserName = currentProfile?.full_name || currentUserName;
  } catch {
    // Fallback to email when profile lookup fails
  }

  // Get all active violations (graceful fallback if RPC not yet deployed)
  let violations: any[] = [];
  try {
    violations = await getActiveViolations(profile.org_id!);
  } catch {
    // RPC may not exist yet — render empty state
  }

  // Operator-only: fetch intelligence items + enforcement scores + command score trends
  let intelligence: any[] = [];
  let venueScores: any[] = [];
  let managerScores: any[] = [];
  let commandScoreTrends: Awaited<ReturnType<typeof getManagerCommandScoreTrend>> = [];
  if (isOperator) {
    try {
      intelligence = await getActiveIntelligence(profile.org_id!, { limit: 30 });
    } catch {
      // Table may not exist yet — render empty state
    }

    // Fetch latest enforcement scores
    try {
      const supabase = getServiceClient() as any;
      const cutoff7d = new Date();
      cutoff7d.setDate(cutoff7d.getDate() - 7);
      const cutoffStr = cutoff7d.toISOString().split('T')[0];

      const [venueResult, managerResult] = await Promise.all([
        supabase
          .from('enforcement_scores')
          .select('entity_id, entity_name, score, components, business_date')
          .eq('org_id', profile.org_id!)
          .eq('entity_type', 'venue')
          .gte('business_date', cutoffStr)
          .order('business_date', { ascending: false })
          .limit(100),
        supabase
          .from('enforcement_scores')
          .select('entity_id, entity_name, score, components, business_date')
          .eq('org_id', profile.org_id!)
          .eq('entity_type', 'manager')
          .gte('business_date', cutoffStr)
          .order('business_date', { ascending: false })
          .limit(100),
      ]);

      // Deduplicate to latest per entity
      const dedup = (rows: any[]) => {
        const map = new Map<string, any>();
        for (const row of rows || []) {
          if (!map.has(row.entity_id) || row.business_date > map.get(row.entity_id).business_date) {
            map.set(row.entity_id, row);
          }
        }
        return Array.from(map.values()).sort((a, b) => a.score - b.score);
      };

      venueScores = dedup(venueResult.data || []);
      managerScores = dedup(managerResult.data || []);
    } catch {
      // Table may not exist yet
    }

    try {
      commandScoreTrends = await getManagerCommandScoreTrend(profile.org_id!);
    } catch {
      // Table may not exist yet
    }
  }

  // Attestation-derived actions, supporting signals, trend data, and follow-through rates
  let orgCommitments: Awaited<ReturnType<typeof getOrgOpenCommitments>> = [];
  let orgSignals: Awaited<ReturnType<typeof getOrgRecentSignals>> = [];
  let signalTrend: Awaited<ReturnType<typeof getOrgSignalTrend>> = { weekly: [], period: [], yearly: [] };
  let followThroughRates: Awaited<ReturnType<typeof getOrgFollowThroughRates>> = [];
  try {
    [orgCommitments, orgSignals, signalTrend, followThroughRates] = await Promise.all([
      getOrgOpenCommitments(profile.org_id!, { limit: 15 }),
      getOrgRecentSignals(profile.org_id!, { days: 7, limit: 50 }),
      getOrgSignalTrend(profile.org_id!),
      getOrgFollowThroughRates(profile.org_id!),
    ]);
  } catch {
    // Table may not exist yet — render empty state
  }

  // Group violations by severity
  const critical = violations.filter((v) => v.severity === 'critical');
  const warnings = violations.filter((v) => v.severity === 'warning');
  const info = violations.filter((v) => v.severity === 'info');

  // Intelligence counts
  const intelCritical = intelligence.filter((i) => i.severity === 'critical').length;
  const intelWarnings = intelligence.filter((i) => i.severity === 'warning').length;

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Operator Intelligence — owner/admin only */}
      {isOperator && intelligence.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-brass" />
              <div>
                <h2 className="text-lg font-semibold">Operator Intelligence</h2>
                <p className="text-xs text-muted-foreground">
                  Internal signals — not visible to managers
                </p>
              </div>
            </div>
            {(intelCritical > 0 || intelWarnings > 0) && (
              <div className="flex gap-3 text-sm">
                {intelCritical > 0 && (
                  <span className="text-red-600 font-semibold">
                    {intelCritical} critical
                  </span>
                )}
                {intelWarnings > 0 && (
                  <span className="text-yellow-600 font-semibold">
                    {intelWarnings} warning{intelWarnings !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          <IntelligenceFeed items={intelligence} orgId={profile.org_id!} />
        </div>
      )}

      {/* Enforcement Scores — operator only */}
      {isOperator && (venueScores.length > 0 || managerScores.length > 0) && (
        <DisciplineScores
          venueScores={venueScores}
          managerScores={managerScores}
        />
      )}

      {/* Command Score Trend — operator only */}
      {isOperator && commandScoreTrends.length > 0 && (
        <CommandScoreTrend managers={commandScoreTrends} />
      )}

      {/* Commitment Follow-Through — all roles, scoped */}
      {followThroughRates.length > 0 && (
        <FollowThroughRate
          managers={followThroughRates}
          currentUserId={user.id}
          isOperator={isOperator}
        />
      )}

      {/* Unified Action Queue — commitments + violations merged by urgency */}
      <ActionQueue
        commitments={orgCommitments}
        violations={{ critical, warnings, info }}
        currentUserId={user.id}
        currentUserName={currentUserName}
      />

      {/* Signal Feed — read-only informational signals (excludes commitments) */}
      <SignalFeed signals={orgSignals} trendData={signalTrend} />
    </div>
  );
}
