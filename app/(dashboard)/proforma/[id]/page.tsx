export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ProformaProjectClient } from "@/components/proforma/ProformaProjectClient";

export default async function ProformaProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's organizations
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

  // Get project with scenarios and assumptions
  const { data: project, error } = await supabase
    .from("proforma_projects")
    .select(
      `
      *,
      revenue_centers (*),
      service_periods (*),
      proforma_scenarios (
        id,
        name,
        is_base,
        months,
        start_month,
        preopening_start_month,
        opening_month,
        proforma_revenue_assumptions (*),
        proforma_cogs_assumptions (*),
        proforma_labor_assumptions (*),
        proforma_occupancy_opex_assumptions (*),
        proforma_capex_assumptions (*),
        proforma_preopening_assumptions (*)
      )
    `
    )
    .eq("id", id)
    .in("org_id", orgIds)
    .single();

  if (error || !project) {
    notFound();
  }

  return (
    <div className="h-full flex flex-col">
      <ProformaProjectClient project={project} />
    </div>
  );
}
