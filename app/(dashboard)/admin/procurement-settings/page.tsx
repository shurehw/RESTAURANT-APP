export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { ProcurementSettingsManager } from './ProcurementSettingsManager';

export default async function AdminProcurementSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: orgs } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      organizations (
        id,
        name
      )
    `)
    .eq('user_id', user?.id ?? '')
    .eq('is_active', true);

  const organizations = orgs?.map(o => o.organizations).filter(Boolean) || [];

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
