"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

interface InvoiceReviewActionsProps {
  invoiceId: string;
  allMapped: boolean;
}

export function InvoiceReviewActions({
  invoiceId,
  allMapped,
}: InvoiceReviewActionsProps) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.details || result.error || "Failed to approve invoice");
      }

      router.push("/invoices");
      router.refresh();
    } catch (error) {
      console.error("Error approving invoice:", error);
      alert(error instanceof Error ? error.message : "Failed to approve invoice. Please try again.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/delete`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Failed to delete invoice");
      }

      router.push("/invoices");
      router.refresh();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      alert(error instanceof Error ? error.message : "Failed to delete invoice. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div data-invoice-review-actions-ready={isReady ? "true" : "false"} className="contents">
      <Button
        variant="destructive"
        onClick={handleDelete}
        disabled={isDeleting || isApproving}
        className="gap-2"
      >
        <Trash2 className="w-4 h-4" />
        {isDeleting ? "Deleting..." : "Delete"}
      </Button>
      {allMapped && (
        <Button
          variant="brass"
          onClick={handleApprove}
          disabled={isApproving || isDeleting}
        >
          {isApproving ? "Approving..." : "Approve & Save"}
        </Button>
      )}
    </div>
  );
}
