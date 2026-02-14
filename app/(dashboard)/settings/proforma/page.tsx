export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { ProformaSettingsClient } from "@/components/settings/ProformaSettingsClient";

export default async function ProformaSettingsPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  const supabase = await createClient();

  const orgUser = { organization_id: orgId };

  // Get or create settings
  const { data: settings } = await supabase
    .from("proforma_settings")
    .select("*")
    .eq("org_id", orgUser.organization_id)
    .single();

  return (
    <div className="h-full flex flex-col">
      <ProformaSettingsClient settings={settings} orgId={orgUser.organization_id} />
    </div>
  );
}
