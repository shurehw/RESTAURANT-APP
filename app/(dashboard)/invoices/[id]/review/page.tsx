/**
 * Invoice Review & Mapping Page
 * Review OCR-extracted invoice and map unmapped items
 */

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, XCircle, List } from "lucide-react";
import { InvoiceLineMapper } from "@/components/invoices/InvoiceLineMapper";
import { InvoiceReviewActions } from "@/components/invoices/InvoiceReviewActions";
import { InvoicePDFModal } from "@/components/invoices/InvoicePDFModal";
import { BulkItemMapper } from "@/components/invoices/BulkItemMapper";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default async function InvoiceReviewPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch invoice with vendor and venue
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      vendor:vendors(id, name),
      venue:venues(id, name)
    `)
    .eq("id", id)
    .single();

  if (!invoice) {
    redirect("/invoices");
  }

  // Fetch invoice lines with GL account info
  const { data: lines } = await supabase
    .from("invoice_lines")
    .select(`
      *,
      item:items(
        id,
        name,
        sku,
        gl_account:gl_accounts(id, external_code, name, section)
      )
    `)
    .eq("invoice_id", id)
    .order("created_at", { ascending: true });

  const allLines = lines || [];
  const mappedLines = allLines.filter((l) => l.item_id !== null);
  const unmappedLines = allLines.filter((l) => l.item_id === null);
  const backorderedLines = allLines.filter((l) => l.qty === 0);

  // Calculate GL breakdown for mapped items
  const glBreakdown = mappedLines.reduce((acc, line) => {
    const glAccount = line.item?.gl_account;
    if (!glAccount) return acc;

    const key = glAccount.id;
    if (!acc[key]) {
      acc[key] = {
        gl_account: glAccount,
        total: 0,
        line_count: 0,
      };
    }
    acc[key].total += Number(line.line_total) || 0;
    acc[key].line_count += 1;
    return acc;
  }, {} as Record<string, { gl_account: any; total: number; line_count: number }>);

  type GLBreakdownItem = { gl_account: any; total: number; line_count: number };
  const glSummary = (Object.values(glBreakdown) as GLBreakdownItem[]).sort((a, b) => b.total - a.total);

  const mappingProgress = allLines.length > 0
    ? Math.round((mappedLines.length / allLines.length) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-header">Review Invoice</h1>
            <p className="text-muted-foreground">
              Map line items to your product catalog
            </p>
          </div>

          <div className="flex gap-3">
            {invoice.storage_path && (
              <InvoicePDFModal invoiceId={id} />
            )}
            <Button variant="outline" asChild>
              <a href="/invoices">Cancel</a>
            </Button>
            <InvoiceReviewActions
              invoiceId={id}
              allMapped={unmappedLines.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Invoice Summary */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-6 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Vendor</div>
            <div className="font-semibold">{invoice.vendor?.name || "Unknown"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Invoice #</div>
            <div className="font-mono font-medium">{invoice.invoice_number || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Date</div>
            <div>{new Date(invoice.invoice_date).toLocaleDateString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Terms</div>
            <div>{invoice.payment_terms || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Due Date</div>
            <div>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Total</div>
            <div className="font-semibold text-lg">${invoice.total_amount?.toFixed(2)}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Mapping Progress</div>
            <div className="text-sm text-muted-foreground">
              {mappedLines.length} of {allLines.length} items mapped
            </div>
          </div>
          <div className="w-full bg-opsos-sage-100 rounded-full h-2">
            <div
              className="bg-brass h-2 rounded-full transition-all duration-300"
              style={{ width: `${mappingProgress}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sage/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-sage" />
            </div>
            <div>
              <div className="text-2xl font-bold">{mappedLines.length}</div>
              <div className="text-sm text-muted-foreground">Auto-Mapped</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-brass" />
            </div>
            <div>
              <div className="text-2xl font-bold">{unmappedLines.length}</div>
              <div className="text-sm text-muted-foreground">Needs Review</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-opsos-slate-100 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-opsos-slate-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{allLines.length}</div>
              <div className="text-sm text-muted-foreground">Total Items</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Unmapped Items Section */}
      {unmappedLines.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-brass" />
              Items Needing Review ({unmappedLines.length})
            </h2>
          </div>

          {/* Individual Item Cards */}
          <div className="space-y-4">
            {unmappedLines.map((line) => (
              <InvoiceLineMapper
                key={line.id}
                line={line}
                vendorId={invoice.vendor_id}
                vendorName={invoice.vendor?.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Backordered Items Section */}
      {backorderedLines.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <XCircle className="w-5 h-5 text-orange-600" />
              Backordered Items ({backorderedLines.length})
            </h2>
          </div>
          <Card className="overflow-hidden border-orange-200">
            <table className="w-full">
              <thead className="bg-orange-50 border-b-2 border-orange-300">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Mapped To</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Unit Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {backorderedLines.map((line) => (
                  <tr key={line.id} className="border-b border-border hover:bg-orange-50/30">
                    <td className="px-4 py-3 text-sm">{line.description}</td>
                    <td className="px-4 py-3">
                      {line.item_id ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="sage" className="text-xs">
                            {line.item?.name || "—"}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {line.item?.sku}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">Unmapped</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono">
                      ${line.unit_cost?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                        Not Shipped
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Mapped Items Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-sage" />
          Mapped Items ({mappedLines.filter(l => l.qty > 0).length})
        </h2>

        {mappedLines.filter(l => l.qty > 0).length > 0 ? (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b-2 border-brass">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Mapped To</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Unit Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {mappedLines.filter(l => l.qty > 0).map((line) => (
                  <tr key={line.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm">{line.description}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="sage" className="text-xs">
                          {line.item?.name || "—"}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {line.item?.sku}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono">{line.qty}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono">
                      ${line.unit_cost?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono font-medium">
                      ${line.line_total?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="p-8 text-center text-muted-foreground">
            No items have been mapped yet
          </Card>
        )}
      </div>

      {/* GL Account Summary */}
      {mappedLines.length > 0 && glSummary.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            GL Account Breakdown
          </h2>
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b-2 border-brass">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold">GL Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold">Section</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Line Items</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">Total Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">% of Invoice</th>
                </tr>
              </thead>
              <tbody>
                {glSummary.map((item) => {
                  const percentage = invoice.total_amount
                    ? (item.total / invoice.total_amount) * 100
                    : 0;
                  return (
                    <tr key={item.gl_account.id} className="border-b border-border hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">
                          {item.gl_account.external_code && (
                            <span className="text-brass font-mono mr-2">
                              {item.gl_account.external_code}
                            </span>
                          )}
                          {item.gl_account.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          item.gl_account.section === 'COGS' ? 'sage' :
                          item.gl_account.section === 'Opex' ? 'brass' :
                          'outline'
                        } className="text-xs">
                          {item.gl_account.section}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {item.line_count}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold">
                        ${item.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                        {percentage.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted border-t-2 border-brass">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right font-semibold">
                    Total Mapped:
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-lg">
                    ${glSummary.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {invoice.total_amount
                      ? ((glSummary.reduce((sum, item) => sum + item.total, 0) / invoice.total_amount) * 100).toFixed(1)
                      : 0}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {unmappedLines.length > 0 && (
            <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded text-sm">
              <strong>Note:</strong> {unmappedLines.length} line item(s) still need to be mapped.
              Complete mapping to see full GL breakdown.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
