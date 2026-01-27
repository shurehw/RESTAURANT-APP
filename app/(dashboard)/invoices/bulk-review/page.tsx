/**
 * Bulk Item Mapping Page
 * Map unmapped items from all invoices in one place
 */

import { createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { InvoiceLineMapper } from "@/components/invoices/InvoiceLineMapper";
import Link from "next/link";
import { BulkReviewFilters } from "./BulkReviewFilters";

type SearchParams = {
  page?: string;
  limit?: string;
  vendor?: string;
  sort?: string;
  search?: string;
  hasCode?: string;
};

export default async function BulkReviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createAdminClient();

  // Parse params
  const page = Math.max(1, Number(searchParams?.page || "1") || 1);
  const limitRaw = Number(searchParams?.limit || "100") || 100;
  const limit = Math.min(500, Math.max(25, limitRaw));
  const vendorFilter = searchParams?.vendor || "";
  const sortBy = searchParams?.sort || "date_desc";
  const searchTerm = searchParams?.search || "";
  const hasCodeFilter = searchParams?.hasCode; // "true", "false", or undefined

  // Get all vendors with unmapped items for the filter dropdown
  const { data: vendorsWithUnmapped } = await supabase
    .from("invoice_lines")
    .select(`
      invoice:invoices!inner(
        vendor_id,
        vendor:vendors(id, name)
      )
    `)
    .is("item_id", null);

  // Extract unique vendors
  const vendorMap = new Map<string, string>();
  vendorsWithUnmapped?.forEach((line: any) => {
    const vid = line.invoice?.vendor_id;
    const vname = line.invoice?.vendor?.name;
    if (vid && vname && !vendorMap.has(vid)) {
      vendorMap.set(vid, vname);
    }
  });
  const vendors = Array.from(vendorMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build query for counting
  let countQuery = supabase
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .is("item_id", null);

  if (vendorFilter) {
    // Need to filter by vendor through the invoice relation
    const { data: vendorInvoices } = await supabase
      .from("invoices")
      .select("id")
      .eq("vendor_id", vendorFilter);
    const invoiceIds = vendorInvoices?.map((i) => i.id) || [];
    if (invoiceIds.length > 0) {
      countQuery = countQuery.in("invoice_id", invoiceIds);
    } else {
      countQuery = countQuery.eq("invoice_id", "00000000-0000-0000-0000-000000000000"); // No results
    }
  }

  if (hasCodeFilter === "true") {
    countQuery = countQuery.not("vendor_item_code", "is", null);
  } else if (hasCodeFilter === "false") {
    countQuery = countQuery.is("vendor_item_code", null);
  }

  if (searchTerm) {
    countQuery = countQuery.ilike("description", `%${searchTerm}%`);
  }

  const { count: totalUnmapped } = await countQuery;

  const total = totalUnmapped || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const safeFrom = (safePage - 1) * limit;
  const safeTo = safeFrom + limit - 1;

  // Build main query
  let query = supabase
    .from("invoice_lines")
    .select(`
      *,
      invoice:invoices!inner(
        id,
        invoice_number,
        invoice_date,
        vendor_id,
        vendor:vendors(id, name),
        venue:venues(id, name)
      )
    `)
    .is("item_id", null);

  if (vendorFilter) {
    query = query.eq("invoice.vendor_id", vendorFilter);
  }

  if (hasCodeFilter === "true") {
    query = query.not("vendor_item_code", "is", null);
  } else if (hasCodeFilter === "false") {
    query = query.is("vendor_item_code", null);
  }

  if (searchTerm) {
    query = query.ilike("description", `%${searchTerm}%`);
  }

  // Sort
  switch (sortBy) {
    case "date_asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "date_desc":
      query = query.order("created_at", { ascending: false });
      break;
    case "description_asc":
      query = query.order("description", { ascending: true });
      break;
    case "description_desc":
      query = query.order("description", { ascending: false });
      break;
    case "vendor_asc":
      // Will sort in JS after fetch since nested sort isn't straightforward
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data: unmappedLines } = await query.range(safeFrom, safeTo);

  let lines = unmappedLines || [];

  // Client-side sort by vendor if needed
  if (sortBy === "vendor_asc") {
    lines = [...lines].sort((a, b) => {
      const va = a.invoice?.vendor?.name || "";
      const vb = b.invoice?.vendor?.name || "";
      return va.localeCompare(vb);
    });
  }

  // Group by vendor for easier mapping
  const linesByVendor = lines.reduce((acc, line) => {
    const vendorId = line.invoice.vendor_id;
    const vendorName = line.invoice.vendor?.name || "Unknown";
    if (!acc[vendorId]) {
      acc[vendorId] = {
        vendorId,
        vendorName,
        lines: [],
      };
    }
    acc[vendorId].lines.push(line);
    return acc;
  }, {} as Record<string, { vendorId: string; vendorName: string; lines: any[] }>);

  const vendorGroups: { vendorId: string; vendorName: string; lines: any[] }[] = Object.values(linesByVendor);

  // Sort vendor groups alphabetically
  vendorGroups.sort((a, b) => a.vendorName.localeCompare(b.vendorName));

  // Build base URL for pagination links
  const baseParams = new URLSearchParams();
  if (vendorFilter) baseParams.set("vendor", vendorFilter);
  if (sortBy !== "date_desc") baseParams.set("sort", sortBy);
  if (searchTerm) baseParams.set("search", searchTerm);
  if (hasCodeFilter) baseParams.set("hasCode", hasCodeFilter);
  baseParams.set("limit", String(limit));

  const buildUrl = (p: number) => {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(p));
    return `/invoices/bulk-review?${params.toString()}`;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/invoices">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Invoices
                </Link>
              </Button>
            </div>
            <h1 className="page-header">Bulk Item Mapping</h1>
            <p className="text-muted-foreground">
              Map all unmapped items across invoices in one place
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <BulkReviewFilters
        vendors={vendors}
        currentVendor={vendorFilter}
        currentSort={sortBy}
        currentSearch={searchTerm}
        currentHasCode={hasCodeFilter}
        limit={limit}
      />

      {/* Summary */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brass/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-brass" />
          </div>
          <div>
            <div className="text-2xl font-bold">{total.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">
              Showing {lines.length} of {total.toLocaleString()} unmapped line item{total !== 1 ? "s" : ""} • Page{" "}
              {safePage} of {totalPages} • {vendorGroups.length} vendor{vendorGroups.length !== 1 ? "s" : ""}
              {vendorFilter && " (filtered)"}
            </div>
          </div>
        </div>
        {/* Pagination Controls */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" asChild disabled={safePage <= 1}>
            <Link href={buildUrl(Math.max(1, safePage - 1))}>
              Prev
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            {safePage > 2 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={buildUrl(1)}>1</Link>
              </Button>
            )}
            {safePage > 3 && <span className="text-muted-foreground">...</span>}
            {safePage > 1 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={buildUrl(safePage - 1)}>{safePage - 1}</Link>
              </Button>
            )}
            <Button variant="default" size="sm" disabled>
              {safePage}
            </Button>
            {safePage < totalPages && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={buildUrl(safePage + 1)}>{safePage + 1}</Link>
              </Button>
            )}
            {safePage < totalPages - 2 && <span className="text-muted-foreground">...</span>}
            {safePage < totalPages - 1 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={buildUrl(totalPages)}>{totalPages}</Link>
              </Button>
            )}
          </div>

          <Button variant="outline" size="sm" asChild disabled={safePage >= totalPages}>
            <Link href={buildUrl(Math.min(totalPages, safePage + 1))}>
              Next
            </Link>
          </Button>
        </div>
      </Card>

      {/* No unmapped items */}
      {lines.length === 0 && (
        <Card className="p-12 text-center">
          <div className="text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">
              {total === 0 && !vendorFilter && !searchTerm
                ? "All items are mapped!"
                : "No items match your filters"}
            </p>
            <p className="text-sm">
              {total === 0 && !vendorFilter && !searchTerm
                ? "There are no unmapped items across your invoices."
                : "Try adjusting your filters to see more items."}
            </p>
          </div>
        </Card>
      )}

      {/* Groups by vendor */}
      {vendorGroups.map((group) => (
        <div key={group.vendorId} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold">{group.vendorName}</h2>
            <Badge variant="outline">
              {group.lines.length} item{group.lines.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="space-y-4">
            {group.lines.map((line) => (
              <InvoiceLineMapper
                key={line.id}
                line={line}
                vendorId={group.vendorId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
