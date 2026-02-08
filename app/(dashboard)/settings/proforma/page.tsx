export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProformaSettingsClient } from "@/components/settings/ProformaSettingsClient";

export default async function ProformaSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's organization
  const { data: orgUser } = await supabase
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!orgUser?.organization_id) {
    return (
      <div className="p-6">
        <p className="text-red-500">No organization found</p>
      </div>
    );
  }

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
