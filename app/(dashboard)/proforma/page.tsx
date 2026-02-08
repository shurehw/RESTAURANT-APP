export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProformaClient } from "@/components/proforma/ProformaClient";

export default async function ProformaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's organizations (they may have multiple)
  const { data: orgUsers } = await supabase
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!orgUsers || orgUsers.length === 0) {
    return (
      <div className="p-6">
        <p className="text-red-500">No organization found for user</p>
      </div>
    );
  }

  const orgIds = orgUsers.map(ou => ou.organization_id);

  // Get all active (non-archived) projects for ALL user's organizations
  const { data: projects, error } = await supabase
    .from("proforma_projects")
    .select(`
      *,
      proforma_scenarios (
        id,
        name,
        is_base,
        months,
        start_month
      )
    `)
    .in("org_id", orgIds)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading projects:", error);
  }

  return (
    <div className="h-full flex flex-col">
      <ProformaClient
        projects={projects || []}
        organizationId={orgIds[0]}
      />
    </div>
  );
}
