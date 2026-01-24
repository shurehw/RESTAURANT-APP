/**
 * OpsOS Invoices Page
 * Table with approve/export actions, brass accents
 */

import { createClient, createAdminClient } from "@/lib/supabase/server";
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
import { cookies } from 'next/headers';

export default async function InvoicesPage() {
  const supabase = await createClient();

  // Get user ID from cookie (custom auth system)
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get('user_id');

  if (!userIdCookie?.value) {
    return <div className="p-8">Not authenticated. Please log in.</div>;
  }

  const customUserId = userIdCookie.value;

  // Get user's email from custom users table
  const { data: customUser } = await supabase
    .from('users')
    .select('email')
    .eq('id', customUserId)
    .single();

  if (!customUser) {
    return <div className="p-8">User not found. Please log in again.</div>;
  }

  // Get auth user ID from email (organization_users references auth.users)
  // Use admin client to query auth.users
  const adminClient = createAdminClient();
  const { data: authUsers } = await adminClient.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(u => u.email?.toLowerCase() === customUser.email.toLowerCase());
  const authUserId = authUser?.id;

  if (!authUserId) {
    return <div className="p-8">No auth user found for this account. Please contact support or sign up again.</div>;
  }

  // Get user's organization using auth user ID
  const { data: orgUsers } = await adminClient
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', authUserId)
    .eq('is_active', true);

  const orgId = orgUsers?.[0]?.organization_id;

  if (!orgId) {
    return <div className="p-8">No organization associated with your account.</div>;
  }

  // Admin client already created above

  // First get venues for this organization
  const { data: venues } = await adminClient
    .from("venues")
    .select("id, name")
    .eq('organization_id', orgId);

  const venueIds = venues?.map(v => v.id) || [];

  // Get invoices for these venues
  let invoices: any[] = [];
  let error = null;

  if (venueIds.length > 0) {
    const result = await adminClient
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
        vendor:vendor_id(name),
        venue:venue_id(name),
        purchase_orders:purchase_order_id(order_number)
      `
      )
      .in('venue_id', venueIds)
      .order("created_at", { ascending: false })
      .limit(50);

    invoices = result.data || [];
    error = result.error;
  }

  console.log('Invoices query result:', { count: invoices?.length, error, orgId, venueCount: venues?.length });

  return <InvoicesClient invoices={invoices || []} venues={venues || []} />;
}
