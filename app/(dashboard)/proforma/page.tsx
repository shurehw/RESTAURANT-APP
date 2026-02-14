export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { ProformaClient } from "@/components/proforma/ProformaClient";

export default async function ProformaPage() {
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  const supabase = await createClient();

  const orgIds = [orgId];

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
