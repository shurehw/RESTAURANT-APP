export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { CompSettingsManager } from '@/components/admin/CompSettingsManager';

export default async function AdminCompSettingsPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  // Fetch org details for display
  const supabase = await createClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single();

  const organizations = org ? [org] : [];

  return (
    <div className="container max-w-7xl mx-auto py-8">
      <h1 className="page-header">Comp Policy Settings</h1>
      <p className="text-muted-foreground mb-8">
        Configure enforcement rules, thresholds, and approved comp reasons for each organization
      </p>

      <CompSettingsManager organizations={organizations as any[]} />
    </div>
  );
}
