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

type SearchParams = {
  page?: string;
  limit?: string;
};

export default async function BulkReviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createAdminClient();

  const page = Math.max(1, Number(searchParams?.page || "1") || 1);
  const limitRaw = Number(searchParams?.limit || "200") || 200;
  const limit = Math.min(500, Math.max(25, limitRaw)); // safety bounds
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Count total unmapped for pagination
  const { count: totalUnmapped } = await supabase
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .is("item_id", null);

  const total = totalUnmapped || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const safeFrom = (safePage - 1) * limit;
  const safeTo = safeFrom + limit - 1;

  // Fetch all unmapped invoice lines across all invoices
  const { data: unmappedLines } = await supabase
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
    .is("item_id", null)
    .order("created_at", { ascending: false })
    .range(safeFrom, safeTo);

  const lines = unmappedLines || [];

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

      {/* Summary */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-brass/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-brass" />
          </div>
          <div>
            <div className="text-2xl font-bold">{lines.length}</div>
            <div className="text-sm text-muted-foreground">
              Showing {lines.length} of {total} unmapped line item{total !== 1 ? "s" : ""} • Page{" "}
              {safePage} of {totalPages} • {vendorGroups.length} vendor{vendorGroups.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        {/* Pagination Controls */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" asChild disabled={safePage <= 1}>
            <Link href={`/invoices/bulk-review?page=${Math.max(1, safePage - 1)}&limit=${limit}`}>
              Prev
            </Link>
          </Button>

          <div className="text-xs text-muted-foreground">
            Tip: adjust page size with <span className="font-mono">?limit=200</span> (max 500)
          </div>

          <Button variant="outline" size="sm" asChild disabled={safePage >= totalPages}>
            <Link href={`/invoices/bulk-review?page=${Math.min(totalPages, safePage + 1)}&limit=${limit}`}>
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
            <p className="text-lg font-medium mb-2">All items are mapped!</p>
            <p className="text-sm">There are no unmapped items across your invoices.</p>
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
