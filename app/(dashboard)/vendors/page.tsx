/**
 * OpsOS Vendors Page
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
import { Plus, Users, Phone, Mail } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";

export default async function VendorsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  // Get user's organization
  let userId: string | null = null;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    userId = user.id;
  } else {
    const userIdCookie = cookieStore.get('user_id');
    userId = userIdCookie?.value || null;
  }

  // Use admin client to bypass RLS and get org-specific vendors
  const adminClient = createAdminClient();

  // Get user's organization
  const { data: orgUsers } = await adminClient
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId!)
    .eq('is_active', true);

  const orgId = orgUsers?.[0]?.organization_id;

  // Fetch vendors for this organization
  const { data: vendors } = await adminClient
    .from("vendors")
    .select("*")
    .eq("organization_id", orgId!)
    .order("name", { ascending: true })
    .limit(100);

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Vendors</h1>
          <p className="text-muted-foreground">
            Manage vendor relationships and contact information
          </p>
        </div>

        <Button variant="brass">
          <Plus className="w-4 h-4" />
          Add Vendor
        </Button>
      </div>

      {/* Vendors Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors?.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">
                  <Link href={`/vendors/${vendor.id}`} className="hover:text-brass transition-colors">
                    {vendor.name}
                  </Link>
                </TableCell>
                <TableCell>{vendor.contact_name || "—"}</TableCell>
                <TableCell>
                  {vendor.phone ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      {vendor.phone}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {vendor.email ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      {vendor.email}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{vendor.payment_terms || "—"}</TableCell>
                <TableCell>
                  <Badge variant={vendor.is_active ? "sage" : "default"}>
                    {vendor.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/vendors/${vendor.id}`}>
                      View
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {(!vendors || vendors.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No vendors found</h3>
          <p className="empty-state-description">
            Add your first vendor to start ordering
          </p>
          <Button variant="brass">
            <Plus className="w-4 h-4" />
            Add Vendor
          </Button>
        </div>
      )}
    </div>
  );
}
