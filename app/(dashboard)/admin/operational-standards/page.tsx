export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { OperationalStandardsManager } from '@/components/admin/OperationalStandardsManager';

export default async function AdminOperationalStandardsPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  const organizations = org ? [org] : [];

  return (
    <div className="container max-w-7xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Operational Standards</h1>
        <p className="text-muted-foreground mt-2">
          Configure unified enforcement standards for comp, labor, and revenue management
        </p>
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900 font-medium">
            🔒 <strong>Enforcement Principle:</strong> Companies calibrate sensitivity, not accountability.
            OpsOS defines what must be reviewed.
          </p>
          <ul className="mt-2 text-sm text-blue-800 space-y-1 ml-6 list-disc">
            <li><strong>Layer 1:</strong> Fixed rails (non-negotiable bounds)</li>
            <li><strong>Layer 2:</strong> Company calibration (bounded by OpsOS ranges)</li>
            <li><strong>Layer 3:</strong> Venue targets (derived, not authored)</li>
          </ul>
        </div>
      </div>

      {organizations.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <p className="text-muted-foreground">
            You need admin or owner role to manage operational standards
          </p>
        </div>
      ) : (
        <OperationalStandardsManager organizations={organizations as any[]} />
      )}
    </div>
  );
}
