import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ItemBulkImport } from '@/components/items/ItemBulkImport';
import { ItemsTable } from '@/components/items/ItemsTable';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ItemsPage() {
  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) {
    redirect('/login');
  }

  // Get user's organization
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', user.user.id)
    .eq('is_active', true);

  if (!orgUsers || orgUsers.length === 0) {
    return <div>No organization found</div>;
  }

  const orgId = orgUsers[0].organization_id;

  // Get items count
  const { count: itemsCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', true);

  // Get recent items
  const { data: recentItems } = await supabase
    .from('items')
    .select('id, name, sku, category, subcategory, base_uom, created_at')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100);

  // Get pack configs for these items
  if (recentItems && recentItems.length > 0) {
    const itemIds = recentItems.map(item => item.id);
    const { data: packConfigs } = await supabase
      .from('item_pack_configurations')
      .select('item_id, pack_type, units_per_pack, unit_size, unit_size_uom')
      .in('item_id', itemIds)
      .eq('is_active', true);

    // Attach pack configs to items
    if (packConfigs) {
      recentItems.forEach((item: any) => {
        item.item_pack_configurations = packConfigs.filter(pc => pc.item_id === item.id);
      });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ledger-black">Item Master</h1>
          <p className="text-sm text-muted-foreground">
            Manage inventory items, pack sizes, and par levels
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-brass">{itemsCount || 0}</div>
          <div className="text-xs text-muted-foreground">Total Items</div>
        </div>
      </div>

      {/* Bulk Import Section */}
      <ItemBulkImport />

      {/* Items Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ledger-black mb-4">All Items</h2>
        <ItemsTable items={(recentItems || []) as any} />
      </Card>
    </div>
  );
}
