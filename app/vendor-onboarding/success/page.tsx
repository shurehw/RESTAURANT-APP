/**
 * Vendor Onboarding Success Page
 */

import { Building2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VendorOnboardingSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-opsos-sage-50 to-brass/5 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-12 h-12 text-sage" />
        </div>

        {/* Message */}
        <h1 className="text-3xl font-bold mb-4">Thank You!</h1>
        <p className="text-lg text-muted-foreground mb-6">
          Your vendor profile has been successfully submitted.
        </p>

        <div className="p-4 bg-brass/5 border border-brass/20 rounded-lg mb-6">
          <p className="text-sm text-muted-foreground">
            Your information is being reviewed. You will be notified once your profile has been approved and payment processing is set up.
          </p>
        </div>

        {/* Additional Info */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Building2 className="w-4 h-4" />
          <span>Powered by OpsOS Restaurant Intelligence Platform</span>
        </div>
      </div>
    </div>
  );
}
