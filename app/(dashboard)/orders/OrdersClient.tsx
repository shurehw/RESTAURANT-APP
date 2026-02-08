"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VenueQuickSwitcher } from "@/components/ui/VenueQuickSwitcher";
import { useVenue } from "@/components/providers/VenueProvider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, ShoppingCart, Trash2, Search, Sparkles, AlertTriangle } from "lucide-react";
import { createOrder } from "@/app/actions/orders";
import { searchItems, ItemSearchResult } from "@/app/actions/items";
import { toast } from "sonner";
import { useTransition } from "react";
import Link from "next/link";

type Order = {
  id: string;
  order_number: string | null;
  order_date: string | null;
  delivery_date: string | null;
  status: string;
  total_amount: number | null;
  vendor: { name: string } | null;
  venue: { name: string } | null;
};

type Vendor = {
  id: string;
  name: string;
};

type Venue = {
  id: string;
  name: string;
};

type Item = ItemSearchResult;

type OrderItem = {
  item_id: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  base_uom: string;
};

interface OrdersClientProps {
  orders: Order[];
  vendors: Vendor[];
  venues: Venue[];
}

export function OrdersClient({ orders, vendors, venues }: OrdersClientProps) {
  const { selectedVenue } = useVenue();
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showItemSearch, setShowItemSearch] = useState(false);

  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Filter orders by selected venue
  const filteredOrders = useMemo(() => {
    if (!selectedVenue) return orders;
    return orders.filter(order => order.venue?.name === selectedVenue.name);
  }, [orders, selectedVenue]);

  // Debounced search effect could be added here, but for simplicity we'll just search on change for now
  // or use a small timeout.
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (value.length >= 2) {
      setIsSearching(true);
      try {
        const results = await searchItems(value);
        setSearchResults(results);
      } catch (err) {
        console.error("Failed to search items", err);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
    }
  };

  const addItem = (item: Item, suggestedQty?: number, suggestedPrice?: number) => {
    const existing = orderItems.find((oi) => oi.item_id === item.id);
    if (!existing) {
      setOrderItems([
        ...orderItems,
        {
          item_id: item.id,
          item_name: item.name,
          sku: item.sku,
          quantity: suggestedQty || 1,
          unit_price: suggestedPrice || 0,
          base_uom: item.base_uom,
        },
      ]);
    }
    setSearchTerm("");
    setShowItemSearch(false);
  };

  // Load suggested items when venue and vendor are selected
  const loadSuggestedItems = async () => {
    if (!venueId) {
      toast.error("Please select a venue first");
      return;
    }

    setLoadingSuggestions(true);
    try {
      const url = vendorId 
        ? `/api/orders/suggested-items?venue_id=${venueId}&vendor_id=${vendorId}`
        : `/api/orders/suggested-items?venue_id=${venueId}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSuggestedItems(data.items || []);
        if (data.items?.length === 0) {
          toast.info("No items below reorder point");
        }
      } else {
        toast.error("Failed to load suggested items");
      }
    } catch (error) {
      console.error("Error loading suggestions:", error);
      toast.error("Error loading suggested items");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addAllSuggested = () => {
    const newItems: OrderItem[] = [];
    for (const suggested of suggestedItems) {
      const existing = orderItems.find((oi) => oi.item_id === suggested.item_id);
      if (!existing) {
        newItems.push({
          item_id: suggested.item_id,
          item_name: suggested.item_name,
          sku: suggested.sku,
          quantity: suggested.suggested_qty,
          unit_price: suggested.last_cost,
          base_uom: suggested.base_uom,
        });
      }
    }
    if (newItems.length > 0) {
      setOrderItems([...orderItems, ...newItems]);
      toast.success(`Added ${newItems.length} suggested items`);
    }
    setSuggestedItems([]);
  };

  const removeItem = (item_id: string) => {
    setOrderItems(orderItems.filter((oi) => oi.item_id !== item_id));
  };

  const updateItemQuantity = (item_id: string, quantity: number) => {
    setOrderItems(
      orderItems.map((oi) =>
        oi.item_id === item_id ? { ...oi, quantity } : oi
      )
    );
  };

  const updateItemPrice = (item_id: string, unit_price: number) => {
    setOrderItems(
      orderItems.map((oi) =>
        oi.item_id === item_id ? { ...oi, unit_price } : oi
      )
    );
  };

  const totalAmount = orderItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("vendor_id", vendorId);
    formData.append("venue_id", venueId);
    formData.append("delivery_date", deliveryDate);
    formData.append("items", JSON.stringify(orderItems));

    startTransition(async () => {
      const result = await createOrder({} as any, formData);

      if (result.error) {
        toast.error(result.error);
        if (result.validationErrors) {
          console.error("Validation errors:", result.validationErrors);
        }
      } else if (result.success) {
        toast.success("Order created successfully");
        setOpen(false);
        resetForm();
      }
    });
  };

  const resetForm = () => {
    setVendorId("");
    setVenueId("");
    setDeliveryDate("");
    setOrderItems([]);
    setSearchTerm("");
    setShowItemSearch(false);
    setSuggestedItems([]);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="page-header">Orders</h1>
          <p className="text-muted-foreground">
            Place orders and track deliveries
          </p>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="brass">
              <Plus className="w-4 h-4" />
              New Order
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>New Order</SheetTitle>
              <SheetDescription>
                Create a new purchase order
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleSubmit} className="space-y-6 mt-6">
              {/* Vendor Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Vendor</label>
                <select
                  className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
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
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
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
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  required
                />
              </div>

              {/* Order Items */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Order Items</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadSuggestedItems}
                      disabled={loadingSuggestions || !venueId}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      {loadingSuggestions ? "Loading..." : "Suggested Items"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowItemSearch(!showItemSearch)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                </div>

                {/* Suggested Items Panel */}
                {suggestedItems.length > 0 && (
                  <div className="mb-4 p-4 border-2 border-brass rounded-lg bg-brass/5">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-brass" />
                        <span className="font-medium text-sm">
                          {suggestedItems.length} items below reorder point
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="brass"
                        size="sm"
                        onClick={addAllSuggested}
                      >
                        Add All
                      </Button>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {suggestedItems.map((item) => (
                        <div
                          key={item.item_id}
                          className="flex items-center justify-between p-2 bg-white rounded border"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.item_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.sku} • On hand: {item.qty_on_hand} / Reorder at: {item.reorder_point}
                            </div>
                          </div>
                          <div className="text-right mr-3">
                            <div className="text-sm font-medium">Qty: {item.suggested_qty}</div>
                            <div className="text-xs text-muted-foreground">
                              ${item.last_cost?.toFixed(2)}/ea
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addItem(
                              { id: item.item_id, name: item.item_name, sku: item.sku, category: item.category, base_uom: item.base_uom },
                              item.suggested_qty,
                              item.last_cost
                            )}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Item Search */}
                {showItemSearch && (
                  <div className="mb-4 p-4 border rounded-lg bg-opsos-sage-50">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search items by name or SKU..."
                        className="w-full pl-10 pr-3 py-2 border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
                        value={searchTerm}
                        onChange={handleSearchChange}
                        autoFocus
                      />
                    </div>
                    {searchTerm && (
                      <div className="max-h-60 overflow-y-auto border rounded-md bg-white">
                        {isSearching && (
                          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                            Searching...
                          </div>
                        )}
                        {!isSearching && searchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => addItem(item)}
                            className="w-full text-left px-3 py-2 hover:bg-opsos-sage-50 border-b last:border-b-0 flex justify-between items-start"
                          >
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.sku} • {item.category}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.base_uom}
                            </div>
                          </button>
                        ))}
                        {!isSearching && searchTerm.length >= 2 && searchResults.length === 0 && (
                          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                            No items found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Order Items List */}
                {orderItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    No items added yet
                    <br />
                    <span className="text-xs">Click "Add Item" to get started</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orderItems.map((item) => (
                      <div
                        key={item.item_id}
                        className="p-3 border rounded-lg bg-white"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium">{item.item_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.sku}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(item.item_id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1">
                              Quantity ({item.base_uom})
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full px-2 py-1 text-sm border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItemQuantity(
                                  item.item_id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">
                              Unit Price
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full px-2 py-1 text-sm border border-opsos-sage-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brass"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateItemPrice(
                                  item.item_id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="mt-2 text-right text-sm font-medium">
                          Line Total: ${(item.quantity * item.unit_price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                {orderItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <span>Order Total:</span>
                      <span>${totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="brass" disabled={orderItems.length === 0 || isPending}>
                  {isPending ? "Creating..." : "Create Order"}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* Quick Venue Switcher */}
      <VenueQuickSwitcher />

      {/* Orders Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders?.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono font-medium">
                  {order.order_number || "—"}
                </TableCell>
                <TableCell>{order.vendor?.name || "—"}</TableCell>
                <TableCell>{order.venue?.name || "—"}</TableCell>
                <TableCell>
                  {order.order_date
                    ? new Date(order.order_date).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell>
                  {order.delivery_date
                    ? new Date(order.delivery_date).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  ${order.total_amount?.toFixed(2) || "0.00"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {(!orders || orders.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No orders yet</h3>
          <p className="empty-state-description">
            Place your first order to get started
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "default" | "brass" | "sage" | "error"> = {
    draft: "default",
    pending: "brass",
    ordered: "brass",
    received: "sage",
    cancelled: "error",
  };

  const labelMap: Record<string, string> = {
    draft: "Draft",
    pending: "Pending",
    ordered: "Ordered",
    received: "Received",
    cancelled: "Cancelled",
  };

  return (
    <Badge variant={variantMap[status] || "default"}>
      {labelMap[status] || status}
    </Badge>
  );
}
