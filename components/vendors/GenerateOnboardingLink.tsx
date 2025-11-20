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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GenerateOnboardingLinkProps {
  vendorId: string;
  vendorName: string;
}

export function GenerateOnboardingLink({ vendorId, vendorName }: GenerateOnboardingLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState('');

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/vendor-onboarding/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, emailTo }),
      });

      if (response.ok) {
        const data = await response.json();
        setLink(data.link);
      } else {
        alert('Failed to generate link');
      }
    } catch (error) {
      console.error('Error generating link:', error);
      alert('Error generating link');
    } finally {
      setIsGenerating(false);
    }
  };

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
          Generate Onboarding Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vendor Onboarding Link</DialogTitle>
          <DialogDescription>
            Generate a secure link for {vendorName} to submit their profile information
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="emailTo">Send to Email (Optional)</Label>
              <Input
                id="emailTo"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="vendor@example.com"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full"
              variant="brass"
            >
              {isGenerating ? 'Generating...' : 'Generate Link'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground mb-2">Shareable Link (valid for 30 days)</p>
              <p className="text-sm font-mono break-all">{link}</p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCopy}
                className="flex-1"
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
              <Button
                onClick={() => {
                  setLink('');
                  setEmailTo('');
                }}
                variant="ghost"
              >
                Generate New
              </Button>
            </div>

            <div className="text-xs text-muted-foreground p-3 bg-blue-50 border border-blue-200 rounded">
              💡 Share this link with your vendor to collect their banking information and documents securely.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
