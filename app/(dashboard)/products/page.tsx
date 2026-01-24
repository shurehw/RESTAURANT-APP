/**
 * OpsOS Products Page
 */

// Force dynamic rendering - don't cache this page
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  // Get user's organization using auth user ID (use admin client to bypass RLS if needed)
  const { data: orgUsers } = await adminClient
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', authUserId)
    .eq('is_active', true);

  console.log('Organization users query result:', { customUserId, authUserId, orgUsers, count: orgUsers?.length });

  const orgId = orgUsers?.[0]?.organization_id;

  // Don't query if no org ID
  let items: any[] | null = null;
  let itemsError: any = null;

  if (orgId) {
    // Use admin client to bypass RLS (user is already authenticated via cookie)
    // adminClient already created above

    // Fetch ALL items using pagination (Supabase has 1000 row limit per request)
    const allItems: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const result = await adminClient
        .from("items")
        .select("id, name, sku, category, subcategory, base_uom, gl_account_id, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, created_at, organization_id, is_active")
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (result.error) {
        itemsError = result.error;
        break;
      }

      if (result.data && result.data.length > 0) {
        allItems.push(...result.data);
        page++;
        hasMore = result.data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    items = allItems;
    itemsError = itemsError;

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
    console.error('No organization ID found for user:', customUserId);
  }

  // Fetch pack configs for items in this organization using admin client
  let itemsWithConfigs: any[] = (items || []).map(item => ({
    ...item,
    item_pack_configurations: []
  }));

  if (items && items.length > 0 && orgId) {
    // adminClient already created above
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

  // adminClient already created above
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
