export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { AdminSettingsTabs } from './AdminSettingsTabs';

export default async function AdminSettingsPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', orgId)
    .single();

  const organizations = org ? [org] : [];

  return (
    <div className="container max-w-7xl mx-auto py-8">
      <h1 className="page-header">Settings</h1>
      <p className="text-muted-foreground mb-6">
        Organization configuration, enforcement rules, and procurement
      </p>

      <AdminSettingsTabs organizations={organizations as any[]} />
    </div>
  );
}
