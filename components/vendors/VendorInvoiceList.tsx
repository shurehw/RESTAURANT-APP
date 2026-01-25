"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { InvoicePDFModal } from "@/components/invoices/InvoicePDFModal";
import { Eye } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: string;
  venue_id: string;
  storage_path: string;
  venues?: { name: string } | null;
}

interface VendorInvoiceListProps {
  invoices: Invoice[];
}

export function VendorInvoiceList({ invoices }: VendorInvoiceListProps) {
  return (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <div
          key={invoice.id}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4"
        >
          <Link
            href={`/invoices/${invoice.id}/review`}
            className="flex-1 flex items-center justify-between min-w-0"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium font-mono truncate">{invoice.invoice_number}</div>
              <div className="text-sm text-muted-foreground">
                {new Date(invoice.invoice_date).toLocaleDateString()}
                {invoice.venues && (
                  <> • <span className="text-brass">{invoice.venues.name}</span></>
                )}
              </div>
            </div>
            <div className="text-right ml-4">
              <div className="font-semibold">${invoice.total_amount?.toFixed(2)}</div>
              <Badge variant="outline" className="text-xs">
                {invoice.status}
              </Badge>
            </div>
          </Link>

          {/* PDF Modal Button */}
          <div className="flex-shrink-0">
            <InvoicePDFModal invoiceId={invoice.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
