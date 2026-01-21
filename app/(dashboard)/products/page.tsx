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
import { Badge } from "@/components/ui/badge";

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

  const { data: items } = await supabase
    .from("items")
    .select("*, item_pack_configs(pack_type, units_per_pack, unit_size, unit_size_uom)")
    .eq('organization_id', orgId || '')
    .eq('is_active', true)
    .order("name", { ascending: true })
    .limit(50);

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

      {/* Recent Products Table */}
      <div className="border border-opsos-sage-200 rounded-md overflow-hidden">
        <div className="p-4 bg-opsos-sage-50 border-b border-opsos-sage-200">
          <h2 className="text-sm font-semibold text-ledger-black">Recent Products (50 of {totalCount})</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Recipe Unit</TableHead>
              <TableHead>Pack Configs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((item) => {
              const configs = (item as any).item_pack_configs || [];
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {item.subcategory || item.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{item.base_uom}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {configs.map((config: any, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 bg-brass/10 text-brass rounded text-xs font-mono">
                          {config.units_per_pack > 1
                            ? `${config.units_per_pack} × ${config.unit_size}${config.unit_size_uom}`
                            : `${config.unit_size}${config.unit_size_uom}`
                          }
                        </span>
                      ))}
                      {configs.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {(!items || items.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Plus className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No items found</h3>
          <p className="empty-state-description">
            Add your first item to get started
          </p>
          <Button variant="brass">
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      )}
    </div>
  );
}
