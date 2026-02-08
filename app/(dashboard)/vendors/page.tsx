export const dynamic = 'force-dynamic';

/**
 * OpsOS Vendors Page
 */

import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";
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

export default async function VendorsPage() {
  // ========================================================================
  // Use centralized context resolver (handles both Supabase auth and legacy)
  // ========================================================================
  const ctx = await resolveContext();

  if (!ctx || !ctx.isAuthenticated) {
    return <div className="p-8">Not authenticated. Please log in.</div>;
  }

  if (!ctx.authUserId) {
    return <div className="p-8">No auth user found for this account. Please log out and log back in.</div>;
  }

  const orgId = ctx.orgId;
  const isPlatformAdmin = ctx.isPlatformAdmin;
  
  console.log('Vendors page context:', { 
    authUserId: ctx.authUserId, 
    email: ctx.email, 
    orgId, 
    role: ctx.role,
    isPlatformAdmin 
  });

  if (!orgId && !isPlatformAdmin) {
    return (
      <div className="p-8">
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No organization access</h3>
          <p className="empty-state-description">
            Your account is not associated with any organization. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Data queries use admin client with explicit org filter
  // Platform admins see all data (RLS bypass handles filtering)
  // ========================================================================
  const adminClient = createAdminClient();

  // Fetch vendors - platform admins see all, regular users see their org only
  let vendorsQuery = adminClient
    .from("vendors")
    .select("*")
    .order("name", { ascending: true })
    .limit(100);
  
  if (!isPlatformAdmin && orgId) {
    vendorsQuery = vendorsQuery.eq("organization_id", orgId);
  }
  
  const { data: vendors } = await vendorsQuery;

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
