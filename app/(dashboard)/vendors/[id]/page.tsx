/**
 * Vendor Detail & Profile Page
 * View and manage vendor information, ACH forms, and documents
 */

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, FileText, CreditCard, History } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorProfileForm } from "@/components/vendors/VendorProfileForm";
import { GenerateOnboardingLink } from "@/components/vendors/GenerateOnboardingLink";
import { VendorInvoiceList } from "@/components/vendors/VendorInvoiceList";
import { cookies } from "next/headers";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default async function VendorDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const cookieStore = await cookies();

  // Get user ID for auth (custom or Supabase)
  let userId: string | null = null;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    userId = user.id;
  } else {
    const userIdCookie = cookieStore.get('user_id');
    userId = userIdCookie?.value || null;
  }

  // Use admin client to bypass RLS
  const adminClient = createAdminClient();

  // Fetch vendor with profile
  const { data: vendor } = await adminClient
    .from("vendors")
    .select(`
      *,
      profile:vendor_profiles(*)
    `)
    .eq("id", id)
    .single();

  if (!vendor) {
    redirect("/vendors");
  }

  // Fetch ACH forms
  const { data: achForms } = await adminClient
    .from("vendor_ach_forms")
    .select("*")
    .eq("vendor_id", id)
    .order("created_at", { ascending: false });

  // Fetch ALL invoices (not just 5)
  const { data: allInvoices } = await adminClient
    .from("invoices")
    .select("id, invoice_number, invoice_date, total_amount, status, venue_id, storage_path, venue:venues(name)")
    .eq("vendor_id", id)
    .order("invoice_date", { ascending: false })
    .limit(100); // Show up to 100 invoices

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/vendors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Vendors
            </Link>
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-header flex items-center gap-3">
              <Building2 className="w-8 h-8 text-brass" />
              {vendor.name}
            </h1>
            <p className="text-muted-foreground">
              Vendor profile, banking information, and payment history
            </p>
          </div>

          <div className="flex items-center gap-3">
            <GenerateOnboardingLink vendorId={vendor.id} vendorName={vendor.name} />
            <Badge variant={vendor.is_active ? "sage" : "default"} className="text-sm">
              {vendor.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Status Card */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-brass/5 to-transparent border-brass/20">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Payment Terms</div>
            <div className="font-semibold">{vendor.payment_terms || "Not set"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Profile Status</div>
            <div>
              <Badge variant={vendor.profile?.[0]?.profile_complete ? "sage" : "default"}>
                {vendor.profile?.[0]?.profile_complete ? "Complete" : "Incomplete"}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">ACH Setup</div>
            <div>
              <Badge variant={achForms?.some(f => f.status === 'approved') ? "sage" : "default"}>
                {achForms?.some(f => f.status === 'approved') ? "Authorized" : "Not Authorized"}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Total Invoices</div>
            <div className="font-semibold">{allInvoices?.length || 0}</div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">
            <FileText className="w-4 h-4 mr-2" />
            Profile & Banking
          </TabsTrigger>
          <TabsTrigger value="ach">
            <CreditCard className="w-4 h-4 mr-2" />
            ACH Forms
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Invoice History
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <VendorProfileForm
            vendor={vendor}
            profile={vendor.profile?.[0]}
          />
        </TabsContent>

        {/* ACH Forms Tab */}
        <TabsContent value="ach">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">ACH Authorization Forms</h2>
              <Button variant="brass">
                <FileText className="w-4 h-4 mr-2" />
                New ACH Form
              </Button>
            </div>

            {achForms && achForms.length > 0 ? (
              <div className="space-y-3">
                {achForms.map((form) => (
                  <div key={form.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium capitalize">{form.form_type} Authorization</div>
                      <div className="text-sm text-muted-foreground">
                        Submitted {new Date(form.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge
                      variant={
                        form.status === 'approved' ? 'sage' :
                        form.status === 'rejected' ? 'error' :
                        'default'
                      }
                    >
                      {form.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No ACH forms submitted yet</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Invoice History Tab */}
        <TabsContent value="history">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6">Invoice History ({allInvoices?.length || 0})</h2>

            {allInvoices && allInvoices.length > 0 ? (
              <VendorInvoiceList invoices={allInvoices} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No invoices found for this vendor</p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
