"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import {
  ArrowLeft,
  Send,
  XCircle,
  Package,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

type OrderLine = {
  id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  qty_received: number;
  remaining_qty: number;
  notes: string | null;
  item: {
    id: string;
    name: string;
    sku: string;
    base_uom: string;
    category: string;
  } | null;
};

type Receipt = {
  id: string;
  received_at: string;
  status: string;
  total_amount: number;
  auto_generated: boolean;
  invoice: {
    id: string;
    invoice_number: string;
    invoice_date: string;
  } | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: string;
  variance_severity: string | null;
};

type Variance = {
  id: string;
  invoice_id: string;
  variance_type: string;
  severity: string;
  line_count: number;
  total_variance_amount: number;
  variance_pct: number;
  description: string;
  resolved: boolean;
};

interface OrderDetailClientProps {
  order: any;
  lines: OrderLine[];
  receipts: Receipt[];
  linkedInvoices: Invoice[];
  variances: Variance[];
}

export function OrderDetailClient({
  order,
  lines,
  receipts,
  linkedInvoices,
  variances,
}: OrderDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReceiveSheet, setShowReceiveSheet] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

  // Calculate totals
  const totalOrdered = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalReceived = lines.reduce((sum, l) => sum + (l.qty_received || 0), 0);
  const totalRemaining = lines.reduce((sum, l) => sum + (l.remaining_qty || 0), 0);
  const orderTotal = lines.reduce((sum, l) => sum + (l.line_total || 0), 0);

  const handleSendOrder = async () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}/send`, {
          method: "POST",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to send order");
        }

        toast.success("Order sent to vendor");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send order");
      }
    });
  };

  const handleCancelOrder = async () => {
    if (!confirm("Are you sure you want to cancel this order?")) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}/cancel`, {
          method: "POST",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to cancel order");
        }

        toast.success("Order cancelled");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to cancel order");
      }
    });
  };

  const handleReceive = async () => {
    const linesToReceive = Object.entries(receiveQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([lineId, qty]) => ({ line_id: lineId, qty_received: qty }));

    if (linesToReceive.length === 0) {
      toast.error("No quantities entered");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}/receive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: linesToReceive }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to receive items");
        }

        toast.success("Items received successfully");
        setShowReceiveSheet(false);
        setReceiveQuantities({});
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to receive items");
      }
    });
  };

  const initializeReceiveQuantities = () => {
    const initial: Record<string, number> = {};
    lines.forEach((line) => {
      if (line.remaining_qty > 0) {
        initial[line.id] = line.remaining_qty;
      }
    });
    setReceiveQuantities(initial);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/orders")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="page-header">{order.order_number || "Draft Order"}</h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-muted-foreground">
              {order.vendor?.name} • {order.venue?.name}
            </p>
          </div>

          <div className="flex gap-2">
            {order.status === "draft" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancelOrder}
                  disabled={isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button variant="brass" onClick={handleSendOrder} disabled={isPending}>
                  <Send className="w-4 h-4 mr-2" />
                  Send to Vendor
                </Button>
              </>
            )}

            {order.status === "ordered" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancelOrder}
                  disabled={isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel Order
                </Button>
                <Sheet open={showReceiveSheet} onOpenChange={setShowReceiveSheet}>
                  <SheetTrigger asChild>
                    <Button
                      variant="brass"
                      onClick={() => {
                        initializeReceiveQuantities();
                        setShowReceiveSheet(true);
                      }}
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Receive Items
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Receive Items</SheetTitle>
                      <SheetDescription>
                        Enter quantities received for each item
                      </SheetDescription>
                    </SheetHeader>

                    <div className="mt-6 space-y-4">
                      {lines
                        .filter((l) => l.remaining_qty > 0)
                        .map((line) => (
                          <div
                            key={line.id}
                            className="p-4 border rounded-lg bg-white"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="font-medium">{line.item?.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {line.item?.sku} • {line.item?.base_uom}
                                </div>
                              </div>
                              <div className="text-right text-sm">
                                <div>Ordered: {line.quantity}</div>
                                <div className="text-muted-foreground">
                                  Remaining: {line.remaining_qty}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">
                                Qty Received
                              </label>
                              <input
                                type="number"
                                min="0"
                                max={line.remaining_qty}
                                step="0.01"
                                className="w-full px-3 py-2 border border-opsos-sage-300 rounded-md"
                                value={receiveQuantities[line.id] || ""}
                                onChange={(e) =>
                                  setReceiveQuantities({
                                    ...receiveQuantities,
                                    [line.id]: parseFloat(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                          </div>
                        ))}

                      {lines.filter((l) => l.remaining_qty > 0).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          All items have been received
                        </div>
                      )}

                      <div className="flex gap-3 pt-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => setShowReceiveSheet(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="brass"
                          onClick={handleReceive}
                          disabled={isPending}
                          className="flex-1"
                        >
                          {isPending ? "Receiving..." : "Confirm Receipt"}
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brass" />
            </div>
            <div>
              <div className="text-2xl font-bold">${orderTotal.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Order Total</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sage/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-sage" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalOrdered}</div>
              <div className="text-sm text-muted-foreground">Items Ordered</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalReceived}</div>
              <div className="text-sm text-muted-foreground">Received</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalRemaining}</div>
              <div className="text-sm text-muted-foreground">Remaining</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Order Details */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Order Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Date</span>
              <span>{order.order_date ? new Date(order.order_date).toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery Date</span>
              <span>{order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={order.status} />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Vendor</h3>
          <div className="space-y-2 text-sm">
            <div className="font-medium">{order.vendor?.name}</div>
            {order.notes && (
              <div className="text-muted-foreground">{order.notes}</div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Receiving Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receipts</span>
              <span>{receipts.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Linked Invoices</span>
              <span>{linkedInvoices.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Variances</span>
              <span>{variances.filter((v) => !v.resolved).length} unresolved</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Line Items */}
      <Card className="mb-8">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Line Items</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{line.item?.name || "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.item?.sku} • {line.item?.base_uom}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{line.quantity}</TableCell>
                <TableCell className="text-right font-mono">
                  ${line.unit_price?.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  ${line.line_total?.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {line.qty_received || 0}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {line.remaining_qty || 0}
                </TableCell>
                <TableCell>
                  <LineStatusBadge
                    ordered={line.quantity}
                    received={line.qty_received || 0}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Receipts */}
      {receipts.length > 0 && (
        <Card className="mb-8">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Receipts</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>
                    {new Date(receipt.received_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{receipt.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {receipt.invoice ? (
                      <a
                        href={`/invoices/${receipt.invoice.id}/review`}
                        className="text-brass hover:underline"
                      >
                        {receipt.invoice.invoice_number}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${receipt.total_amount?.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={receipt.auto_generated ? "outline" : "sage"}>
                      {receipt.auto_generated ? "Auto" : "Manual"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Variances */}
      {variances.length > 0 && (
        <Card>
          <div className="p-4 border-b flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold">Variances</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Variance Amount</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variances.map((variance) => (
                <TableRow key={variance.id}>
                  <TableCell className="capitalize">{variance.variance_type}</TableCell>
                  <TableCell>
                    <SeverityBadge severity={variance.severity} />
                  </TableCell>
                  <TableCell>{variance.description || "—"}</TableCell>
                  <TableCell className="text-right font-mono">
                    ${variance.total_variance_amount?.toFixed(2)} ({variance.variance_pct}%)
                  </TableCell>
                  <TableCell className="text-right">{variance.line_count}</TableCell>
                  <TableCell>
                    <Badge variant={variance.resolved ? "sage" : "outline"}>
                      {variance.resolved ? "Resolved" : "Open"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "brass" | "sage" | "destructive"; icon: any }> = {
    draft: { variant: "default", icon: Clock },
    pending: { variant: "brass", icon: Clock },
    ordered: { variant: "brass", icon: Truck },
    received: { variant: "sage", icon: CheckCircle2 },
    cancelled: { variant: "default", icon: XCircle },
  };

  const { variant, icon: Icon } = config[status] || config.draft;

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function LineStatusBadge({ ordered, received }: { ordered: number; received: number }) {
  if (received >= ordered) {
    return <Badge variant="sage">Complete</Badge>;
  }
  if (received > 0) {
    return <Badge variant="brass">Partial</Badge>;
  }
  return <Badge variant="outline">Pending</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, "default" | "brass" | "destructive"> = {
    none: "default",
    minor: "default",
    warning: "brass",
    critical: "destructive",
  };

  return (
    <Badge variant={config[severity] || "default"}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
}
