import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * PATCH /api/items/:id
 * Update an item and its pack configurations
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const {
      name,
      sku,
      category,
      subcategory,
      base_uom,
      gl_account_id,
      item_pack_configs,
    } = body;

    // Get user's organization
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.user.id)
      .eq('is_active', true);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    const orgId = orgUsers[0].organization_id;

    // Verify item belongs to user's organization
    const { data: existingItem } = await supabase
      .from('items')
      .select('id, organization_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (!existingItem) {
      return NextResponse.json(
        { error: 'Item not found or access denied' },
        { status: 404 }
      );
    }

    // Update the item
    const { data: updatedItem, error: updateError } = await supabase
      .from('items')
      .update({
        name,
        sku,
        category,
        subcategory,
        base_uom,
        gl_account_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update item:', updateError);
      return NextResponse.json(
        { error: 'Failed to update item', details: updateError.message },
        { status: 500 }
      );
    }

    // Update pack configurations if provided
    if (item_pack_configs && Array.isArray(item_pack_configs)) {
      // Delete existing pack configs
      await supabase
        .from('item_pack_configs')
        .delete()
        .eq('item_id', id);

      // Insert new pack configs
      if (item_pack_configs.length > 0) {
        const newConfigs = item_pack_configs.map((config: any) => ({
          item_id: id,
          pack_type: config.pack_type,
          units_per_pack: config.units_per_pack,
          unit_size: config.unit_size,
          unit_size_uom: config.unit_size_uom,
          vendor_sku: config.vendor_sku || null,
        }));

        const { error: packError } = await supabase
          .from('item_pack_configs')
          .insert(newConfigs);

        if (packError) {
          console.error('Failed to update pack configs:', packError);
          // Don't fail the whole request, just log the error
        }
      }
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  });
}
