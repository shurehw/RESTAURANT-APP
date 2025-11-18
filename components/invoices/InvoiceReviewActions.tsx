"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface InvoiceReviewActionsProps {
  invoiceId: string;
  allMapped: boolean;
}

export function InvoiceReviewActions({
  invoiceId,
  allMapped,
}: InvoiceReviewActionsProps) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to approve invoice");
      }

      router.push("/invoices");
      router.refresh();
    } catch (error) {
      console.error("Error approving invoice:", error);
      alert("Failed to approve invoice. Please try again.");
    } finally {
      setIsApproving(false);
    }
  };

  if (!allMapped) {
    return null;
  }

  return (
    <Button
      variant="brass"
      onClick={handleApprove}
      disabled={isApproving}
    >
      {isApproving ? "Approving..." : "Approve & Save"}
    </Button>
  );
}
