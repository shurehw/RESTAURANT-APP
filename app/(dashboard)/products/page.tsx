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

  // First fetch items without the join
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .eq('organization_id', orgId || '')
    .eq('is_active', true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
  }

  console.log('Items query result:', {
    count: items?.length,
    orgId,
    hasItems: !!items,
    firstItem: items?.[0]?.name
  });

  // Fetch pack configs separately for the items we got
  let itemsWithConfigs = items || [];
  if (items && items.length > 0) {
    const itemIds = items.map(item => item.id);
    const { data: packConfigs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .in('item_id', itemIds);

    // Attach pack configs to items
    itemsWithConfigs = items.map(item => ({
      ...item,
      item_pack_configurations: packConfigs?.filter(pc => pc.item_id === item.id) || []
    }));
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
