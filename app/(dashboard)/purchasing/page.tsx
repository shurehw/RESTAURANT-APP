export const dynamic = 'force-dynamic';

/**
 * Purchasing Hub
 * Tabs: Orders, Invoices, Vendors, Products
 */

import { Suspense } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { HubTabBar } from '@/components/ui/HubTabBar';
import { OrdersClient } from '@/app/(dashboard)/orders/OrdersClient';
import { InvoicesClient } from '@/app/(dashboard)/invoices/InvoicesClient';
import { ProductsTable } from '@/components/products/ProductsTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Users, Phone, Mail } from 'lucide-react';
import Link from 'next/link';

const TABS = [
  { key: 'orders', label: 'Orders' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'products', label: 'Products' },
];

export default async function PurchasingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab || 'orders';

  const ctx = await resolveContext();
  if (!ctx?.isAuthenticated || !ctx.authUserId) {
    return <div className="p-8">Not authenticated. Please log in.</div>;
  }

  const orgId = ctx.orgId;
  const isPlatformAdmin = ctx.isPlatformAdmin;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="page-header">Purchasing</h1>
        <p className="text-muted-foreground">
          Orders, invoices, vendors, and products
        </p>
      </div>

      <HubTabBar tabs={TABS} basePath="/purchasing" defaultTab="orders" />

      <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading...</div>}>
        {tab === 'orders' && <OrdersTab />}
        {tab === 'invoices' && <InvoicesTab orgId={orgId} isPlatformAdmin={isPlatformAdmin} />}
        {tab === 'vendors' && <VendorsTab orgId={orgId} isPlatformAdmin={isPlatformAdmin} />}
        {tab === 'products' && <ProductsTab orgId={orgId} isPlatformAdmin={isPlatformAdmin} />}
      </Suspense>
    </div>
  );
}

async function OrdersTab() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from('purchase_orders')
    .select(`
      id, order_number, order_date, delivery_date, status, total_amount,
      vendor:vendors!inner(name),
      venue:venues!inner(name)
    `)
    .order('order_date', { ascending: false })
    .limit(50) as any;

  const { data: vendors } = await supabase
    .from('vendors').select('id, name').order('name').limit(1000);

  const { data: venues } = await supabase
    .from('venues').select('id, name').order('name').limit(1000);

  return <OrdersClient orders={orders || []} vendors={vendors || []} venues={venues || []} />;
}

async function InvoicesTab({ orgId, isPlatformAdmin }: { orgId: string | null; isPlatformAdmin: boolean }) {
  const adminClient = createAdminClient();

  let venuesQuery = adminClient.from('venues').select('id, name');
  if (!isPlatformAdmin && orgId) venuesQuery = venuesQuery.eq('organization_id', orgId);
  const { data: venues } = await venuesQuery;
  const venueIds = venues?.map(v => v.id) || [];

  let invoices: any[] = [];
  if (venueIds.length > 0 || isPlatformAdmin) {
    let q = adminClient
      .from('invoices')
      .select(`
        id, invoice_number, invoice_date, total_amount, status,
        ocr_confidence, match_confidence, auto_approved,
        total_variance_pct, variance_severity, purchase_order_id,
        vendor:vendor_id(name), venue:venue_id(name),
        purchase_orders:purchase_order_id(order_number)
      `)
      .order('created_at', { ascending: false });
    if (!isPlatformAdmin && venueIds.length > 0) q = q.in('venue_id', venueIds);
    const result = await q;
    invoices = result.data || [];
  }

  return <InvoicesClient invoices={invoices} venues={venues || []} />;
}

async function VendorsTab({ orgId, isPlatformAdmin }: { orgId: string | null; isPlatformAdmin: boolean }) {
  const adminClient = createAdminClient();

  let q = adminClient.from('vendors').select('*').order('name').limit(100);
  if (!isPlatformAdmin && orgId) q = q.eq('organization_id', orgId);
  const { data: vendors } = await q;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button variant="brass"><Plus className="w-4 h-4" /> Add Vendor</Button>
      </div>
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
                <TableCell>{vendor.contact_email || '—'}</TableCell>
                <TableCell>
                  {vendor.contact_phone ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      {vendor.contact_phone}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell>
                  {vendor.contact_email ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      {vendor.contact_email}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell>{vendor.payment_terms_days ? `Net ${vendor.payment_terms_days}` : '—'}</TableCell>
                <TableCell>
                  <Badge variant={vendor.is_active ? 'sage' : 'default'}>
                    {vendor.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/vendors/${vendor.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!vendors || vendors.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No vendors found. Add your first vendor to start ordering.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

async function ProductsTab({ orgId, isPlatformAdmin }: { orgId: string | null; isPlatformAdmin: boolean }) {
  const adminClient = createAdminClient();

  const allItems: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = adminClient
      .from('items')
      .select('id, name, sku, category, subcategory, base_uom, gl_account_id, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, created_at, organization_id, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (!isPlatformAdmin && orgId) query = query.eq('organization_id', orgId);
    const result = await query;
    if (result.error || !result.data?.length) { hasMore = false; break; }
    allItems.push(...result.data);
    page++;
    hasMore = result.data.length === pageSize;
  }

  // Fetch pack configs
  const itemIds = allItems.map(i => i.id);
  const allPackConfigs: any[] = [];
  for (let i = 0; i < itemIds.length; i += 300) {
    const batch = itemIds.slice(i, i + 300);
    const { data: packConfigs } = await adminClient
      .from('item_pack_configurations').select('*').in('item_id', batch);
    if (packConfigs) allPackConfigs.push(...packConfigs);
  }
  const packConfigsByItem = new Map<string, any[]>();
  allPackConfigs.forEach(pc => {
    if (!packConfigsByItem.has(pc.item_id)) packConfigsByItem.set(pc.item_id, []);
    packConfigsByItem.get(pc.item_id)!.push(pc);
  });
  const itemsWithConfigs = allItems.map(item => ({
    ...item, item_pack_configurations: packConfigsByItem.get(item.id) || [],
  }));

  const { count: totalCount } = await adminClient
    .from('items').select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId || '').eq('is_active', true);

  return <ProductsTable initialProducts={itemsWithConfigs} totalCount={totalCount || 0} orgId={orgId || ''} />;
}
