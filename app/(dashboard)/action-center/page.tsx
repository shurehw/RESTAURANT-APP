/**
 * Action Center - Unified Violation Feed
 * Shows all active violations across all OpSOS systems
 */

import { requireUser } from '@/lib/auth/require-user';
import { getActiveViolations } from '@/lib/database/enforcement';
import { ViolationFeed } from './violation-feed';

export default async function ActionCenterPage() {
  const { profile } = await requireUser();

  // Get all active violations
  const violations = await getActiveViolations(profile.org_id);

  // Group by severity
  const critical = violations.filter((v) => v.severity === 'critical');
  const warnings = violations.filter((v) => v.severity === 'warning');
  const info = violations.filter((v) => v.severity === 'info');

  return (
    <div className="container mx-auto p-6 space-y-6">
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

      <ViolationFeed
        critical={critical}
        warnings={warnings}
        info={info}
      />
    </div>
  );
}
