"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { BulkInvoiceUploadButton } from "@/components/invoices/BulkInvoiceUploadButton";
import { Download, Check, AlertCircle, CheckCircle, Zap, List, X, Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { VenueQuickSwitcher } from "@/components/ui/VenueQuickSwitcher";
import { useVenue } from "@/components/providers/VenueProvider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const router = useRouter();
  const { selectedVenue } = useVenue();
  const [loading, setLoading] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  // Search, filter, sort, pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "vendor">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Get unique vendors for filter
  const uniqueVendors = useMemo(() => {
    const vendors = invoices.map(inv => inv.vendor?.name).filter(Boolean);
    return Array.from(new Set(vendors)).sort();
  }, [invoices]);

  // Filter, search, and sort invoices
  const filteredInvoices = useMemo(() => {
    let result = invoices;

    // Filter by selected venue
    if (selectedVenue) {
      result = result.filter(inv => inv.venue?.name === selectedVenue.name);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(inv =>
        inv.invoice_number?.toLowerCase().includes(term) ||
        inv.vendor?.name?.toLowerCase().includes(term) ||
        inv.purchase_orders?.order_number?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter(inv => inv.status === statusFilter);
    }

    // Vendor filter
    if (vendorFilter !== "all") {
      result = result.filter(inv => inv.vendor?.name === vendorFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "date") {
        comparison = new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime();
      } else if (sortBy === "amount") {
        comparison = (a.total_amount || 0) - (b.total_amount || 0);
      } else if (sortBy === "vendor") {
        comparison = (a.vendor?.name || "").localeCompare(b.vendor?.name || "");
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [invoices, selectedVenue, searchTerm, statusFilter, vendorFilter, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, vendorFilter, sortBy, sortOrder]);

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

  const handleApprove = async (invoiceId: string) => {
    if (!confirm('Approve this invoice?')) return;

    setApproving(invoiceId);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: 'POST',
      });

      if (response.ok) {
        router.refresh();
      } else {
        const result = await response.json();
        alert(`Failed to approve: ${result.error}`);
      }
    } catch (error) {
      alert('Error approving invoice');
      console.error(error);
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (invoiceId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // User cancelled

    setRejecting(invoiceId);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        const result = await response.json();
        alert(`Failed to reject: ${result.error}`);
      }
    } catch (error) {
      alert('Error rejecting invoice');
      console.error(error);
    } finally {
      setRejecting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="page-header">Invoices</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Auto-match to POs, manage approvals, and R365 exports
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 md:gap-3">
          <Button variant="outline" asChild className="text-sm flex-1 md:flex-none">
            <Link href="/invoices/bulk-review">
              <List className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Bulk Item Mapping</span>
              <span className="sm:hidden">Bulk Map</span>
            </Link>
          </Button>
          <BulkInvoiceUploadButton venues={venues || []} />
          <Button variant="brass" className="text-sm hidden md:flex">
            <Download className="w-4 h-4" />
            Export to R365
          </Button>
        </div>
      </div>

      {/* Quick Venue Switcher */}
      <VenueQuickSwitcher />

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder="Search invoices, vendors, PO numbers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters and Sort */}
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {uniqueVendors.map(vendor => (
                <SelectItem key={vendor} value={vendor as string}>{vendor}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(val) => setSortBy(val as "date" | "amount" | "vendor")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="amount">Amount</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="px-3"
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            {sortOrder === "asc" ? "Ascending" : "Descending"}
          </Button>

          {/* Results count */}
          <div className="flex items-center ml-auto text-sm text-muted-foreground">
            Showing {paginatedInvoices.length} of {filteredInvoices.length} invoices
          </div>
        </div>
      </div>

      {/* Invoice Table - Desktop */}
      <div className="hidden md:block border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>PO #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>OCR</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedInvoices?.map((invoice) => (
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
                  <OCRConfidenceBadge confidence={invoice.ocr_confidence} />
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
                      <>
                        <Button
                          variant="sage"
                          size="sm"
                          onClick={() => handleApprove(invoice.id)}
                          disabled={approving === invoice.id || rejecting === invoice.id}
                        >
                          <Check className="w-3 h-3" />
                          {approving === invoice.id ? "..." : "Approve"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(invoice.id)}
                          disabled={approving === invoice.id || rejecting === invoice.id}
                        >
                          <X className="w-3 h-3" />
                          {rejecting === invoice.id ? "..." : "Reject"}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/invoices/${invoice.id}/review`)}
                    >
                      View
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Invoice Cards - Mobile */}
      <div className="md:hidden space-y-3">
        {paginatedInvoices?.map((invoice) => (
          <div
            key={invoice.id}
            className="border border-border rounded-lg p-4 space-y-3 bg-white"
            onClick={() => router.push(`/invoices/${invoice.id}/review`)}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-mono font-medium text-sm truncate">
                  {invoice.invoice_number || "—"}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {invoice.vendor?.name || "Unknown"}
                </div>
              </div>
              <StatusBadge status={invoice.status} />
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Date:</span>{" "}
                {new Date(invoice.invoice_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="text-right">
                <span className="text-muted-foreground">Amount:</span>{" "}
                <span className="font-semibold">${invoice.total_amount?.toFixed(2) || "0.00"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">OCR:</span>{" "}
                <OCRConfidenceBadge confidence={invoice.ocr_confidence} />
              </div>
              <div className="text-right">
                <VarianceBadge
                  severity={invoice.variance_severity}
                  variancePct={invoice.total_variance_pct}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
              {!invoice.purchase_order_id && invoice.status === "draft" && (
                <Button
                  variant="brass"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => handleAutoMatch(invoice.id)}
                  disabled={loading === invoice.id}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  {loading === invoice.id ? "Matching..." : "Match"}
                </Button>
              )}
              {invoice.status === "pending_approval" && (
                <>
                  <Button
                    variant="sage"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => handleApprove(invoice.id)}
                    disabled={approving === invoice.id || rejecting === invoice.id}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    {approving === invoice.id ? "..." : "Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => handleReject(invoice.id)}
                    disabled={approving === invoice.id || rejecting === invoice.id}
                  >
                    <X className="w-3 h-3 mr-1" />
                    {rejecting === invoice.id ? "..." : "Reject"}
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {filteredInvoices.length > 0 && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!filteredInvoices || filteredInvoices.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No invoices found</h3>
          <p className="empty-state-description">
            {searchTerm || statusFilter !== "all" || vendorFilter !== "all"
              ? "Try adjusting your filters"
              : "Upload your first invoice to get started"}
          </p>
          {!searchTerm && statusFilter === "all" && vendorFilter === "all" && (
            <BulkInvoiceUploadButton venues={venues || []} variant="default" label="Upload Invoice" />
          )}
        </div>
      )}
    </div>
  );
}

function OCRConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const score = Math.round(confidence * 100);
  let variant: "sage" | "brass" | "default" = "default";
  let color = "text-gray-600";

  if (score >= 90) {
    variant = "sage";
    color = "text-green-600";
  } else if (score >= 70) {
    variant = "brass";
    color = "text-yellow-600";
  } else {
    color = "text-red-600";
  }

  return (
    <Badge variant={variant} className="text-xs">
      <span className={color}>{score}%</span>
    </Badge>
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
        <span title="Auto-approved">
          <Zap className="w-3 h-3 text-opsos-brass-500" />
        </span>
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
