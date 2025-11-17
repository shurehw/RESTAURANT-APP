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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-8 text-red-600">Not authenticated</div>;
  }

  // DEBUG: Check org membership
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', user.id);

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

  if (error) {
    return (
      <div className="p-8">
        <div className="text-red-600 mb-4">Error: {error.message}</div>
        <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
          {JSON.stringify({ user: user.email, orgUsers, error }, null, 2)}
        </pre>
      </div>
    );
  }

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true);

  // DEBUG: Show info if no invoices
  if (!invoices || invoices.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl mb-4">Debug Info</h1>
        <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
          {JSON.stringify({
            user: { id: user.id, email: user.email },
            orgMemberships: orgUsers,
            venues: venues,
            invoicesCount: 0,
            message: 'No invoices returned from query'
          }, null, 2)}
        </pre>
      </div>
    );
  }

  return <InvoicesClient invoices={invoices || []} venues={venues || []} />;
}
