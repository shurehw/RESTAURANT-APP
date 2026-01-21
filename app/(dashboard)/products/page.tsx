/**
 * OpsOS Products Page
 */

import { createClient } from "@/lib/supabase/server";
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

export default async function ProductsPage() {
  const supabase = await createClient();

  // Get user's organization
  const { data: user } = await supabase.auth.getUser();

  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', user.user?.id || '')
    .eq('is_active', true);

  const orgId = orgUsers?.[0]?.organization_id;

  // Fetch ALL items without the join (no limit - pagination is client-side)
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .eq('organization_id', orgId || '')
    .eq('is_active', true)
    .order("created_at", { ascending: false });

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
  }

  // Fetch ALL pack configs for the organization (avoid .in() limit issues with 950 items)
  let itemsWithConfigs = items || [];
  if (items && items.length > 0) {
    // Fetch all pack configs at once
    const { data: packConfigs, error: packError } = await supabase
      .from('item_pack_configurations')
      .select('*');

    if (packError) {
      console.error('Error fetching pack configs:', packError);
    }

    // Create a map for faster lookup
    const packConfigsByItem = new Map<string, any[]>();
    packConfigs?.forEach(pc => {
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
      totalPackConfigs: packConfigs?.length || 0,
      itemsWithPacks: itemsWithConfigs.filter(i => i.item_pack_configurations.length > 0).length,
      sampleItem: itemsWithConfigs[0]?.name,
      samplePacks: itemsWithConfigs[0]?.item_pack_configurations?.length
    });
  }

  const { count: totalCount } = await supabase
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
      />
    </div>
  );
}
