export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { ProcurementSettingsManager } from './ProcurementSettingsManager';

export default async function AdminProcurementSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Use same pattern as dashboard layout — users table has organization_id
  const { data: userData } = await (supabase as any)
    .from('users')
    .select('organization_id')
    .eq('id', user?.id ?? '')
    .single();

  let organizations: any[] = [];
  if (userData?.organization_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', userData.organization_id)
      .single();

    if (org) {
      organizations = [org];
    }
  }

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
