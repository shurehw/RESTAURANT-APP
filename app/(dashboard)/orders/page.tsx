/**
 * OpsOS Orders Page
 */

import { createClient } from "@/lib/supabase/server";
import { OrdersClient } from "./OrdersClient";

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("purchase_orders")
    .select(`
      id,
      order_number,
      order_date,
      delivery_date,
      status,
      total_amount,
      vendor:vendors!inner(name),
      venue:venues!inner(name)
    `)
    .order("order_date", { ascending: false })
    .limit(50) as any;

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true);

  const { data: items } = await supabase
    .from("items")
    .select("id, sku, name, category, base_uom")
    .eq("is_active", true)
    .order("name");

  return (
    <OrdersClient
      orders={orders || []}
      vendors={vendors || []}
      venues={venues || []}
      items={items || []}
    />
  );
}
