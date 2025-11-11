"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceUploadButton } from "@/components/invoices/InvoiceUploadButton";
import { Download, Check, AlertCircle, CheckCircle, Zap } from "lucide-react";

type Invoice = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  total_amount: number | null;
  status: string;
  ocr_confidence: number | null;
  match_confidence: string | null;
  auto_approved: boolean | null;
  total_variance_pct: number | null;
  variance_severity: string | null;
  purchase_order_id: string | null;
  vendor: { name: string } | null;
  venue: { name: string } | null;
  purchase_orders: { order_number: string } | null;
};

type Venue = {
  id: string;
  name: string;
};

interface InvoicesClientProps {
  invoices: Invoice[];
  venues: Venue[];
}

export function InvoicesClient({ invoices, venues }: InvoicesClientProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAutoMatch = async (invoiceId: string) => {
    setLoading(invoiceId);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/auto-match`, {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        alert(
          `Auto-match complete!\n\n` +
          `PO: ${result.po_number}\n` +
          `Matched Lines: ${result.matched_lines}\n` +
          `Unmapped: ${result.unmapped_lines}\n` +
          `Auto-approved: ${result.auto_approved ? 'Yes' : 'No'}\n` +
          `Match: ${result.summary.match_pct.toFixed(1)}%`
        );
        window.location.reload();
      } else {
        alert(`Failed to match: ${result.error}`);
      }
    } catch (error) {
      alert('Error during auto-match');
      console.error(error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Invoices</h1>
          <p className="text-muted-foreground">
            Auto-match to POs, manage approvals, and R365 exports
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <InvoiceUploadButton venues={venues || []} />
          <Button variant="brass">
            <Download className="w-4 h-4" />
            Export to R365
          </Button>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>PO #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices?.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-mono font-medium">
                  {invoice.invoice_number || "—"}
                </TableCell>
                <TableCell>{invoice.vendor?.name || "Unknown"}</TableCell>
                <TableCell>{invoice.venue?.name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {invoice.purchase_orders?.order_number || (
                    <span className="text-muted-foreground">No PO</span>
                  )}
                </TableCell>
                <TableCell>
                  {new Date(invoice.invoice_date).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  ${invoice.total_amount?.toFixed(2) || "0.00"}
                </TableCell>
                <TableCell>
                  <MatchConfidenceBadge
                    confidence={invoice.match_confidence}
                    autoApproved={invoice.auto_approved}
                  />
                </TableCell>
                <TableCell>
                  <VarianceBadge
                    severity={invoice.variance_severity}
                    variancePct={invoice.total_variance_pct}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge status={invoice.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {!invoice.purchase_order_id && invoice.status === "draft" && (
                      <Button
                        variant="brass"
                        size="sm"
                        onClick={() => handleAutoMatch(invoice.id)}
                        disabled={loading === invoice.id}
                      >
                        <Zap className="w-3 h-3" />
                        {loading === invoice.id ? "Matching..." : "Auto-Match"}
                      </Button>
                    )}
                    {invoice.status === "pending_approval" && (
                      <Button variant="sage" size="sm">
                        <Check className="w-3 h-3" />
                        Approve
                      </Button>
                    )}
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {(!invoices || invoices.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No invoices found</h3>
          <p className="empty-state-description">
            Upload your first invoice to get started
          </p>
          <InvoiceUploadButton venues={venues || []} />
        </div>
      )}
    </div>
  );
}

function MatchConfidenceBadge({
  confidence,
  autoApproved,
}: {
  confidence: string | null;
  autoApproved: boolean | null;
}) {
  if (!confidence) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const variantMap: Record<string, "sage" | "brass" | "default"> = {
    high: "sage",
    medium: "brass",
    low: "default",
  };

  const iconMap: Record<string, any> = {
    high: CheckCircle,
    medium: AlertCircle,
    low: AlertCircle,
  };

  const Icon = iconMap[confidence] || AlertCircle;

  return (
    <div className="flex items-center gap-1">
      <Badge variant={variantMap[confidence] || "default"} className="text-xs">
        <Icon className="w-3 h-3 mr-1" />
        {confidence}
      </Badge>
      {autoApproved && (
        <Zap className="w-3 h-3 text-opsos-brass-500" title="Auto-approved" />
      )}
    </div>
  );
}

function VarianceBadge({
  severity,
  variancePct,
}: {
  severity: string | null;
  variancePct: number | null;
}) {
  if (!severity || severity === "none") {
    return <span className="text-xs text-opsos-sage-600">✓ None</span>;
  }

  const colorMap: Record<string, string> = {
    minor: "text-yellow-600",
    warning: "text-orange-600",
    critical: "text-red-600",
  };

  const bgMap: Record<string, string> = {
    minor: "bg-yellow-50",
    warning: "bg-orange-50",
    critical: "bg-red-50",
  };

  return (
    <span
      className={`text-xs px-2 py-1 rounded ${colorMap[severity]} ${bgMap[severity]}`}
    >
      {variancePct !== null ? `${Math.abs(variancePct).toFixed(1)}%` : severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "default" | "brass" | "sage" | "error"> = {
    draft: "default",
    pending_approval: "brass",
    approved: "sage",
    exported: "sage",
    failed: "error",
  };

  const labelMap: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Pending",
    approved: "Approved",
    exported: "Exported",
    failed: "Failed",
  };

  return (
    <Badge variant={variantMap[status] || "default"}>
      {labelMap[status] || status}
    </Badge>
  );
}
