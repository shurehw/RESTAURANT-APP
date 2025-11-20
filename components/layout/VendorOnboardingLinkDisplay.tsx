"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface VendorOnboardingLinkDisplayProps {
  organizationSlug: string;
  organizationName: string;
}

export function VendorOnboardingLinkDisplay({ organizationSlug, organizationName }: VendorOnboardingLinkDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/vendor-onboarding/${organizationSlug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="w-4 h-4 mr-2" />
          Vendor Onboarding Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendor Onboarding Link</DialogTitle>
          <DialogDescription>
            Share this link with vendors to collect their profile information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground mb-2">Your Organization's Onboarding Link</p>
            <p className="text-sm font-mono break-all">{link}</p>
          </div>

          <Button
            onClick={handleCopy}
            className="w-full"
            variant="brass"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground p-3 bg-blue-50 border border-blue-200 rounded">
            💡 Vendors can enter their email to access their form, or register as a new vendor.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
