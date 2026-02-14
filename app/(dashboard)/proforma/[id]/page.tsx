export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { ProformaProjectClient } from "@/components/proforma/ProformaProjectClient";

export default async function ProformaProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const { orgId } = await getUserOrgAndVenues(user.id);

  const supabase = await createClient();

  const orgIds = [orgId];

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
