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

interface GenerateOnboardingLinkProps {
  vendorId: string;
  vendorName: string;
}

export function GenerateOnboardingLink({ vendorId, vendorName }: GenerateOnboardingLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/vendor-onboarding`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="w-4 h-4 mr-2" />
          Get Onboarding Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendor Onboarding Link</DialogTitle>
          <DialogDescription>
            Share this universal link with all vendors. They'll enter their email to access their profile form.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground mb-2">Universal Onboarding Link</p>
            <p className="text-sm font-mono break-all">{link}</p>
          </div>

          <Button
            onClick={handleCopy}
            className="w-full"
            variant="outline"
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
            💡 This single link works for all vendors. They identify themselves using their email address.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
