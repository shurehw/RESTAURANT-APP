"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, User, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingChange {
  id: string;
  organization_id: string;
  organization_name: string;
  table_name: string;
  record_id: string;
  proposed_changes: any;
  change_description: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_by: string;
  requested_by_email: string;
  requested_at: string;
  num_changes: number;
}

interface ApprovalWorkflowProps {
  organizationId?: string;
  onApproved?: () => void;
}

export function ApprovalWorkflow({
  organizationId,
  onApproved,
}: ApprovalWorkflowProps) {
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedChange, setSelectedChange] = useState<PendingChange | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    fetchPendingChanges();
  }, [organizationId]);

  const fetchPendingChanges = async () => {
    try {
      let url = "/api/proforma/pending-approvals";
      if (organizationId) {
        url += `?organization_id=${organizationId}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setPendingChanges(data.pending_changes || []);
    } catch (error) {
      console.error("Error fetching pending changes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (approve: boolean) => {
    if (!selectedChange) return;

    setReviewing(true);
    try {
      const response = await fetch("/api/proforma/review-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          change_id: selectedChange.id,
          approve,
          review_notes: reviewNotes,
        }),
      });

      if (response.ok) {
        setReviewDialogOpen(false);
        setSelectedChange(null);
        setReviewNotes("");
        fetchPendingChanges();
        if (approve && onApproved) {
          onApproved();
        }
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error reviewing change:", error);
      alert("Failed to review change");
    } finally {
      setReviewing(false);
    }
  };

  const formatFieldName = (field: string): string => {
    return field
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4">
        <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4" />
          Pending Approvals ({pendingChanges.length})
        </h3>

        <div className="space-y-3">
          {pendingChanges.length === 0 ? (
            <p className="text-sm text-gray-500">No pending approvals</p>
          ) : (
            pendingChanges.map((change) => (
              <div
                key={change.id}
                className="p-3 border border-yellow-300 bg-yellow-50 rounded-lg"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="bg-white">
                        {change.table_name}
                      </Badge>
                      <Badge variant="outline" className="bg-yellow-100">
                        {change.num_changes} change{change.num_changes !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {change.change_description && (
                      <p className="text-sm text-gray-700 mb-2">
                        {change.change_description}
                      </p>
                    )}
                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Requested by {change.requested_by_email}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(change.requested_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedChange(change);
                      setReviewDialogOpen(true);
                    }}
                  >
                    Review Changes
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Settings Change</DialogTitle>
            <DialogDescription>
              Approve or reject the proposed changes below
            </DialogDescription>
          </DialogHeader>

          {selectedChange && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Proposed Changes:</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {Object.entries(selectedChange.proposed_changes).map(
                    ([field, value]) => (
                      <div
                        key={field}
                        className="p-2 border border-gray-200 rounded bg-gray-50"
                      >
                        <div className="text-xs font-medium text-gray-700">
                          {formatFieldName(field)}
                        </div>
                        <div className="text-sm font-medium mt-1">
                          {String(value)}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Review Notes (optional)
                </label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={reviewing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleReview(false)}
              disabled={reviewing}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={() => handleReview(true)}
              disabled={reviewing}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
