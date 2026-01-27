import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

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
    const adminClient = createAdminClient();
    const body = await request.json();

    const {
      name,
      sku,
      category,
      subcategory,
      base_uom,
      gl_account_id,
      item_pack_configurations,
    } = body;

    // Get user id (Supabase session preferred, cookie fallback)
    const cookieStore = await cookies();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id || cookieStore.get('user_id')?.value || null;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: orgUsers } = await adminClient
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    const orgId = orgUsers[0].organization_id;

    // Verify item belongs to user's organization
    const { data: existingItem } = await adminClient
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
    const { data: updatedItem, error: updateError } = await adminClient
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
    if (item_pack_configurations && Array.isArray(item_pack_configurations)) {
      const allowedPackTypes = new Set(['case', 'bottle', 'bag', 'box', 'each', 'keg', 'pail', 'drum']);

      for (const cfg of item_pack_configurations) {
        if (cfg?.pack_type && !allowedPackTypes.has(String(cfg.pack_type))) {
          return NextResponse.json(
            { error: 'Invalid pack_type', details: `Unsupported pack_type: ${cfg.pack_type}` },
            { status: 400 }
          );
        }
      }

      // Delete existing pack configs
      await adminClient
        .from('item_pack_configurations')
        .delete()
        .eq('item_id', id);

      // Insert new pack configs
      if (item_pack_configurations.length > 0) {
        const newConfigs = item_pack_configurations.map((config: any) => ({
          item_id: id,
          pack_type: config.pack_type,
          units_per_pack: config.units_per_pack,
          unit_size: config.unit_size,
          unit_size_uom: config.unit_size_uom,
          vendor_item_code: config.vendor_item_code || null,
        }));

        const { error: packError } = await adminClient
          .from('item_pack_configurations')
          .insert(newConfigs);

        if (packError) {
          console.error('Failed to update pack configs:', packError);
          return NextResponse.json(
            { error: 'Failed to update pack configurations', details: packError.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  });
}
