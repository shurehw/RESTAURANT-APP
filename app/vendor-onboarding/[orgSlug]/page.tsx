/**
 * Organization-specific Vendor Onboarding Landing Page
 * Each organization has their own branded vendor onboarding page
 */

import { createClient } from "@/lib/supabase/server";
import { VendorOnboardingClient } from "@/components/vendors/VendorOnboardingClient";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{
    orgSlug: string;
  }>;
}

export default async function VendorOnboardingPage({ params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  // Fetch organization by slug
  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", orgSlug)
    .single();

  if (!organization) {
    notFound();
  }

  return (
    <VendorOnboardingClient
      organizationId={organization.id}
      organizationName={organization.name}
    />
  );
}
