/**
 * OpsOS Products Page
 */

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Download } from "lucide-react";
import { ItemBulkImport } from "@/components/items/ItemBulkImport";
import { ProductsTable } from "@/components/products/ProductsTable";
import { cookies } from 'next/headers';

export default async function ProductsPage() {
  const supabase = await createClient();

  // Get user ID from cookie (custom auth system)
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get('user_id');

  if (!userIdCookie?.value) {
    return <div className="p-8">Not authenticated. Please log in.</div>;
  }

  const userId = userIdCookie.value;

  // Get user's organization
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  console.log('Organization users query result:', { userId, orgUsers, count: orgUsers?.length });

  const orgId = orgUsers?.[0]?.organization_id;

  // Don't query if no org ID
  let items: any[] | null = null;
  let itemsError: any = null;

  if (orgId) {
    // Use admin client to bypass RLS (user is already authenticated via cookie)
    const adminClient = createAdminClient();

    // Fetch ALL items with R365 fields (set high limit for large catalogs)
    const result = await adminClient
      .from("items")
      .select("id, name, sku, category, subcategory, base_uom, gl_account_id, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, created_at, organization_id, is_active")
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order("created_at", { ascending: false })
      .limit(10000);

    items = result.data;
    itemsError = result.error;

    console.log('Items fetch result:', {
      orgId,
      itemsCount: items?.length || 0,
      error: itemsError,
      firstItem: items?.[0]?.name
    });

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
    }
  } else {
    console.error('No organization ID found for user:', userId);
  }

  // Fetch pack configs for items in this organization using admin client
  let itemsWithConfigs: any[] = (items || []).map(item => ({
    ...item,
    item_pack_configurations: []
  }));

  if (items && items.length > 0 && orgId) {
    const adminClient = createAdminClient();
    const itemIds = items.map(i => i.id);

    // Fetch pack configs for these items (split into batches to avoid .in() limits)
    const batchSize = 300;
    const allPackConfigs: any[] = [];

    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const { data: packConfigs, error: packError } = await adminClient
        .from('item_pack_configurations')
        .select('*')
        .in('item_id', batch);

      if (packError) {
        console.error('Error fetching pack configs batch:', packError);
        console.error('Batch size:', batch.length);
      } else {
        console.log(`Batch ${Math.floor(i/batchSize) + 1}: fetched ${packConfigs?.length || 0} pack configs for ${batch.length} items`);
        if (packConfigs) {
          allPackConfigs.push(...packConfigs);
        }
      }
    }

    // Create a map for faster lookup
    const packConfigsByItem = new Map<string, any[]>();
    allPackConfigs.forEach(pc => {
      if (!packConfigsByItem.has(pc.item_id)) {
        packConfigsByItem.set(pc.item_id, []);
      }
      packConfigsByItem.get(pc.item_id)!.push(pc);
    });

    // Attach pack configs to items
    itemsWithConfigs = items.map(item => ({
      ...item,
      item_pack_configurations: packConfigsByItem.get(item.id) || []
    }));

    console.log('Pack configs loaded:', {
      totalItems: items.length,
      totalPackConfigs: allPackConfigs.length,
      itemsWithPacks: itemsWithConfigs.filter(i => i.item_pack_configurations.length > 0).length,
      sampleItem: itemsWithConfigs[0]?.name,
      samplePacks: itemsWithConfigs[0]?.item_pack_configurations?.length
    });
  }

  const adminClient = createAdminClient();
  const { count: totalCount } = await adminClient
    .from("items")
    .select("*", { count: 'exact', head: true })
    .eq('organization_id', orgId || '')
    .eq('is_active', true);

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="page-header">Products</h1>
          <p className="text-muted-foreground">
            Manage food & beverage products across all venues
          </p>
        </div>

        <div className="text-right">
          <div className="text-3xl font-bold text-brass">{totalCount || 0}</div>
          <div className="text-xs text-muted-foreground">Total Products</div>
        </div>
      </div>

      {/* Bulk Import */}
      <ItemBulkImport />

      {/* Products Table with Search, Filter, Pagination */}
      <ProductsTable
        initialProducts={itemsWithConfigs as any}
        totalCount={totalCount || 0}
        orgId={orgId || ''}
      />
    </div>
  );
}
