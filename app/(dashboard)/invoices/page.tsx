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

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // DEBUG: Check org membership
  const { data: orgUsers } = user ? await supabase
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', user.id) : { data: null };

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

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true);

  // ALWAYS show debug info
  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4 font-bold">Invoice Debug Info</h1>
      <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-screen">
        {JSON.stringify({
          auth: {
            authenticated: !!user,
            user: user ? { id: user.id, email: user.email } : null,
            authError: authError?.message
          },
          orgMemberships: orgUsers,
          venues: venues,
          invoices: {
            count: invoices?.length || 0,
            error: error?.message,
            data: invoices?.map((inv: any) => ({
              id: inv.id,
              number: inv.invoice_number,
              vendor: inv.vendor?.name,
              venue: inv.venue?.name,
              amount: inv.total_amount
            }))
          }
        }, null, 2)}
      </pre>
    </div>
  );
}
