export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { OperationalStandardsManager } from '@/components/admin/OperationalStandardsManager';

export default async function AdminOperationalStandardsPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  // Use admin client — auth already validated by requireUser + getUserOrgAndVenues
  const supabase = createAdminClient();
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  // If error, log it but still try to show the page with empty org
  if (error) {
    console.error('Failed to fetch organization:', error);
  }

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

      {error ? (
        <div className="p-6 border rounded-lg bg-red-50 border-red-200">
          <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Organization</h3>
          <p className="text-sm text-red-800 mb-4">
            {error.message || 'Failed to load organization data'}
          </p>
          <p className="text-xs text-red-700">
            Your org ID: <code className="bg-red-100 px-1 py-0.5 rounded">{orgId}</code>
          </p>
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <p className="text-muted-foreground">
            Organization not found. Contact support if this persists.
          </p>
        </div>
      ) : (
        <OperationalStandardsManager organizations={organizations as any[]} />
      )}
    </div>
  );
}
