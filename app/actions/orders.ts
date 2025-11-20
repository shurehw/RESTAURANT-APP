'use server';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const orderItemSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
});

const createOrderSchema = z.object({
  vendor_id: z.string().uuid(),
  venue_id: z.string().uuid(),
  delivery_date: z.string().date(),
  items: z.array(orderItemSchema).min(1),
});

export type CreateOrderState = {
  success?: boolean;
  error?: string;
  validationErrors?: Record<string, string[]>;
};

export async function createOrder(prevState: CreateOrderState, formData: FormData): Promise<CreateOrderState> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    // Parse and validate input
    const rawData = {
      vendor_id: formData.get('vendor_id'),
      venue_id: formData.get('venue_id'),
      delivery_date: formData.get('delivery_date'),
      items: JSON.parse(formData.get('items') as string || '[]'),
    };

    const validated = createOrderSchema.safeParse(rawData);

    if (!validated.success) {
      return {
        validationErrors: validated.error.flatten().fieldErrors,
        error: 'Invalid order data',
      };
    }

    const { vendor_id, venue_id, delivery_date, items } = validated.data;

    // Calculate total amount
    const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Start transaction (using RPC if available, or sequential inserts for now as Supabase JS doesn't support transactions directly without RPC)
    // Ideally this should be an RPC, but for now we'll do sequential inserts with error checking.
    // Note: If the second insert fails, we have an orphaned order. This is a known risk until we move to RPC.

    // 1. Create Purchase Order
    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({
        vendor_id,
        venue_id,
        delivery_date,
        status: 'ordered', // Defaulting to ordered for now, or 'draft' if preferred
        total_amount,
        created_by: user.id,
      })
      .select('id, order_number')
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      return { error: 'Failed to create order' };
    }

    // 2. Create Order Items
    const orderItems = items.map(item => ({
      purchase_order_id: order.id,
      item_id: item.item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Attempt cleanup (best effort)
      await supabase.from('purchase_orders').delete().eq('id', order.id);
      return { error: 'Failed to create order items' };
    }

    revalidatePath('/orders');
    return { success: true };

  } catch (e: any) {
    console.error('Unexpected error in createOrder:', e);
    return { error: e.message || 'An unexpected error occurred' };
  }
}
