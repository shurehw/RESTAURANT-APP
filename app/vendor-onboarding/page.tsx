/**
 * Generic Vendor Onboarding Landing Page
 * Single link for all vendors - they enter their email/code to identify themselves
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ArrowRight } from "lucide-react";
import { VendorOnboardingForm } from "@/components/vendors/VendorOnboardingForm";

export default function VendorOnboardingLandingPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [vendor, setVendor] = useState<any>(null);
  const [isNewVendor, setIsNewVendor] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/vendor-onboarding/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const data = await response.json();
        setVendor(data.vendor);
      } else {
        const data = await response.json();
        setError(data.error || "Vendor not found. Please check your email or contact your representative.");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show form if vendor found or new vendor
  if (vendor || isNewVendor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-opsos-sage-50 to-brass/5">
        {/* Header */}
        <div className="bg-white border-b border-border">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-brass flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Vendor Profile Setup</h1>
                  <p className="text-sm text-muted-foreground">
                    {isNewVendor
                      ? "Complete your information to register as a new vendor"
                      : "Please complete your vendor information for payment processing"
                    }
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-brass">POWERED BY OpsOS</p>
                <p className="text-sm font-semibold text-opsos-sage">The h.wood Group</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-4xl mx-auto px-6 py-8">
          <VendorOnboardingForm
            vendor={vendor}
            vendorId={vendor?.id}
            isNewVendor={isNewVendor}
          />
        </div>

        {/* Footer */}
        <div className="max-w-4xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          <p>Powered by OpsOS Restaurant Intelligence Platform</p>
        </div>
      </div>
    );
  }

  // Show lookup form
  return (
    <div className="min-h-screen bg-gradient-to-br from-opsos-sage-50 to-brass/5 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        {/* Logo/Icon */}
        <div className="w-16 h-16 bg-brass rounded-lg flex items-center justify-center mx-auto mb-6">
          <Building2 className="w-8 h-8 text-white" />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <p className="text-xs font-medium text-brass mb-1">POWERED BY</p>
            <h2 className="text-lg font-bold">OpsOS</h2>
            <p className="text-xs text-muted-foreground mt-2">for</p>
            <h3 className="text-xl font-bold text-opsos-sage">The h.wood Group</h3>
          </div>
          <h1 className="text-2xl font-bold mb-2 mt-6">Vendor Profile Setup</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email address to access your vendor profile form
          </p>
        </div>

        {/* Lookup Form */}
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@example.com"
              required
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Use the email address associated with your vendor account
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
            variant="brass"
          >
            {isLoading ? (
              "Looking up..."
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>

        {/* Help Text */}
        <div className="mt-6 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground mb-3">
            Need help? Contact your representative for assistance.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsNewVendor(true)}
            className="w-full"
          >
            New Vendor? Register Here
          </Button>
        </div>
      </div>
    </div>
  );
}
