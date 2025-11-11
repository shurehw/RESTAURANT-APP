/**
 * New Order Page
 */

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default async function NewOrderPage() {
  const supabase = await createClient();

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <a href="/orders">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Orders
          </a>
        </Button>

        <h1 className="page-header">New Order</h1>
        <p className="text-muted-foreground">
          Create a new purchase order
        </p>
      </div>

      {/* Order Form */}
      <Card className="p-6 max-w-2xl">
        <form className="space-y-6">
          {/* Vendor Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Vendor</label>
            <select
              className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
              required
            >
              <option value="">Select vendor...</option>
              {vendors?.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>

          {/* Venue Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Venue</label>
            <select
              className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
              required
            >
              <option value="">Select venue...</option>
              {venues?.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Date */}
          <div>
            <label className="block text-sm font-medium mb-2">Delivery Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
              required
            />
          </div>

          {/* Placeholder for line items */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-4">Order Items</h3>
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              Order item builder coming soon...
              <br />
              <span className="text-xs">Search and add items to your order</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t">
            <Button type="button" variant="outline" asChild>
              <a href="/orders">Cancel</a>
            </Button>
            <Button type="submit" variant="brass">
              Create Order
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
