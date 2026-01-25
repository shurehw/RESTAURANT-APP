/**
 * OpsOS Products Page
 */

// Force dynamic rendering - don't cache this page
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createAdminClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/auth/resolveContext";
import { ItemBulkImport } from "@/components/items/ItemBulkImport";
import { ProductsTable } from "@/components/products/ProductsTable";

export default async function ProductsPage() {
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
  
  console.log('Products page context:', { 
    authUserId: ctx.authUserId, 
    email: ctx.email, 
    orgId, 
    role: ctx.role,
    isPlatformAdmin 
  });

  // ========================================================================
  // Data queries use admin client with explicit org filter
  // Platform admins see all data (RLS bypass handles filtering)
  // ========================================================================
  const adminClient = createAdminClient();

  // Don't query if no org ID (unless platform admin)
  let items: any[] | null = null;
  let itemsError: any = null;

  if (orgId || isPlatformAdmin) {
    // Use admin client to bypass RLS (user is already authenticated via cookie)
    // adminClient already created above

    // Fetch ALL items using pagination (Supabase has 1000 row limit per request)
    const allItems: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = adminClient
        .from("items")
        .select("id, name, sku, category, subcategory, base_uom, gl_account_id, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, created_at, organization_id, is_active")
        .eq('is_active', true)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      // Only filter by org if not platform admin
      if (!isPlatformAdmin && orgId) {
        query = query.eq('organization_id', orgId);
      }
      
      const result = await query;

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
      isPlatformAdmin,
      itemsCount: items?.length || 0,
      error: itemsError,
      firstItem: items?.[0]?.name
    });

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
    }
  } else {
    console.error('No organization ID found for user:', ctx.authUserId);
  }

  // Fetch pack configs for items in this organization using admin client
  let itemsWithConfigs: any[] = (items || []).map(item => ({
    ...item,
    item_pack_configurations: []
  }));

  if (items && items.length > 0 && (orgId || isPlatformAdmin)) {
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
