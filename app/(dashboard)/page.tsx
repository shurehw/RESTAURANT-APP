/**
 * Dashboard Landing — Action Center + Operator Intelligence
 * Enforcement-first landing: shows all active violations across OpSOS systems
 * Owner/admin also see an intelligence feed (signals, patterns, ownership alerts)
 */

import { requireUser } from '@/lib/auth/require-user';
import { getActiveViolations } from '@/lib/database/enforcement';
import { getActiveIntelligence } from '@/lib/database/operator-intelligence';
import { ViolationFeed } from '@/components/action-center/violation-feed';
import { IntelligenceFeed } from '@/components/operator/IntelligenceFeed';
import { ShieldAlert } from 'lucide-react';

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const isOperator = profile.role === 'owner' || profile.role === 'admin';

  // Get all active violations (graceful fallback if RPC not yet deployed)
  let violations: any[] = [];
  try {
    violations = await getActiveViolations(profile.org_id!);
  } catch {
    // RPC may not exist yet — render empty state
  }

  // Operator-only: fetch intelligence items
  let intelligence: any[] = [];
  if (isOperator) {
    try {
      intelligence = await getActiveIntelligence(profile.org_id!, { limit: 30 });
    } catch {
      // Table may not exist yet — render empty state
    }
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

      {/* Action Center — visible to all roles */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Action Center</h1>
            <p className="text-muted-foreground">
              Active violations and enforcement actions
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {critical.length}
              </div>
              <div className="text-muted-foreground">Critical</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {warnings.length}
              </div>
              <div className="text-muted-foreground">Warnings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {info.length}
              </div>
              <div className="text-muted-foreground">Info</div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <ViolationFeed
            critical={critical}
            warnings={warnings}
            info={info}
          />
        </div>
      </div>
    </div>
  );
}
