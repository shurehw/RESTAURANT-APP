export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { CompSettingsManager } from '@/components/admin/CompSettingsManager';

export default async function AdminCompSettingsPage() {
  const supabase = await createClient();

  // Get current user's organizations
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: orgs } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      organizations (
        id,
        name,
        logo_url
      )
    `)
    .eq('user_id', user?.id)
    .eq('is_active', true);

  const organizations = orgs?.map(o => o.organizations).filter(Boolean) || [];

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
