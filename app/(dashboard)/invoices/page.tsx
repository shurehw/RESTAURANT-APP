/**
 * OpsOS Invoices Page
 * Table with approve/export actions, brass accents
 */

import { createClient } from "@/lib/supabase/server";
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
import { InvoicesClient } from "./InvoicesClient";
import { Download, Check } from "lucide-react";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      invoice_date,
      total_amount,
      status,
      ocr_confidence,
      match_confidence,
      auto_approved,
      total_variance_pct,
      variance_severity,
      purchase_order_id,
      vendor:vendors!inner(name),
      venue:venues!inner(name),
      purchase_orders:purchase_order_id(order_number)
    `
    )
    .order("invoice_date", { ascending: false })
    .limit(50) as any;

  // Debug logging
  console.log('[INVOICES PAGE] Query result:', {
    count: invoices?.length || 0,
    error: error?.message,
    invoices: invoices?.map((i: any) => ({
      number: i.invoice_number,
      vendor: i.vendor?.name,
      venue: i.venue?.name
    }))
  });

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true);

  return <InvoicesClient invoices={invoices || []} venues={venues || []} />;
}
