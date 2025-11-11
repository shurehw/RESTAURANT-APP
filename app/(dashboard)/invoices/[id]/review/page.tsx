/**
 * Invoice Review & Mapping Page
 * Review OCR-extracted invoice and map unmapped items
 */

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { InvoiceLineMapper } from "@/components/invoices/InvoiceLineMapper";
import { redirect } from "next/navigation";

interface Props {
  params: {
    id: string;
  };
}

export default async function InvoiceReviewPage({ params }: Props) {
  const supabase = await createClient();

  // Fetch invoice with vendor and venue
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      vendor:vendors(id, name),
      venue:venues(id, name)
    `)
    .eq("id", params.id)
    .single();

  if (!invoice) {
    redirect("/invoices");
  }

  // Fetch invoice lines
  const { data: lines } = await supabase
    .from("invoice_lines")
    .select(`
      *,
      item:items(id, name, sku)
    `)
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });

  const allLines = lines || [];
  const mappedLines = allLines.filter((l) => l.item_id !== null);
  const unmappedLines = allLines.filter((l) => l.item_id === null);

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
            <Button variant="outline" asChild>
              <a href="/invoices">Cancel</a>
            </Button>
            {unmappedLines.length === 0 && (
              <Button variant="brass">
                Approve & Save
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Summary */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-4 gap-6">
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
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-brass" />
            Items Needing Review ({unmappedLines.length})
          </h2>

          <div className="space-y-4">
            {unmappedLines.map((line) => (
              <InvoiceLineMapper
                key={line.id}
                line={line}
                vendorId={invoice.vendor_id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mapped Items Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-sage" />
          Mapped Items ({mappedLines.length})
        </h2>

        {mappedLines.length > 0 ? (
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
                {mappedLines.map((line) => (
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
    </div>
  );
}
