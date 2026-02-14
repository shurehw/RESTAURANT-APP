export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { ProcurementSettingsManager } from './ProcurementSettingsManager';

export default async function AdminProcurementSettingsPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  // Fetch org name for display — use admin client since auth is already validated
  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  const organizations = org ? [org] : [];

  return (
    <div className="container max-w-7xl mx-auto py-8">
      <h1 className="page-header">Procurement Settings</h1>
      <p className="text-muted-foreground mb-8">
        Configure exception detection thresholds and purchasing authorizations
      </p>

      <ProcurementSettingsManager organizations={organizations as any[]} />
    </div>
  );
}
