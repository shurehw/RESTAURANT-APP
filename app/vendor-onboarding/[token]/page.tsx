/**
 * Public Vendor Onboarding Form
 * Standalone page for vendors to submit their profile information
 */

import { createClient } from "@/lib/supabase/server";
import { VendorOnboardingForm } from "@/components/vendors/VendorOnboardingForm";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

interface Props {
  params: Promise<{
    token: string;
  }>;
}

export default async function VendorOnboardingPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  // Get vendor by ID (token is the vendor ID)
  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", token)
    .single();

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-opsos-sage-50 to-brass/5 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Invalid Link</h1>
          <p className="text-muted-foreground">
            This vendor onboarding link is not valid. Please contact your representative.
          </p>
        </div>
      </div>
    );
  }

  // Check if profile already complete (allow updates)
  const { data: existingProfile } = await supabase
    .from("vendor_profiles")
    .select("profile_complete")
    .eq("vendor_id", token)
    .single();

  return (
    <div className="min-h-screen bg-gradient-to-br from-opsos-sage-50 to-brass/5">
      {/* Header */}
      <div className="bg-white border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-brass flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Vendor Profile Setup</h1>
              <p className="text-sm text-muted-foreground">
                Please complete your vendor information for payment processing
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <VendorOnboardingForm
          vendor={vendor}
          vendorId={token}
        />
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
        <p>Powered by OpsOS Restaurant Intelligence Platform</p>
      </div>
    </div>
  );
}
