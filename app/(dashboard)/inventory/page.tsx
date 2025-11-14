/**
 * OpsOS Inventory Counts Page
 */

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, ClipboardList } from "lucide-react";

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: counts } = await supabase
    .from("inventory_counts")
    .select(`
      id,
      count_date,
      status,
      counted_by,
      venue:venues!inner(name)
    `)
    .order("count_date", { ascending: false })
    .limit(50);

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Inventory Counts</h1>
          <p className="text-muted-foreground">
            Track physical inventory counts and variance
          </p>
        </div>

        <Button variant="brass">
          <Plus className="w-4 h-4" />
          New Count
        </Button>
      </div>

      {/* Counts Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Counted By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts?.map((count) => (
              <TableRow key={count.id}>
                <TableCell className="font-mono">
                  {new Date(count.count_date).toLocaleDateString()}
                </TableCell>
                <TableCell>{(count.venue as any)?.name || "—"}</TableCell>
                <TableCell>{count.counted_by || "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={count.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Empty State */}
      {(!counts || counts.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="empty-state-title">No inventory counts</h3>
          <p className="empty-state-description">
            Start your first inventory count
          </p>
          <Button variant="brass">
            <Plus className="w-4 h-4" />
            New Count
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "default" | "brass" | "sage" | "error"> = {
    draft: "default",
    open: "brass",
    completed: "sage",
    cancelled: "error",
  };

  const labelMap: Record<string, string> = {
    draft: "Draft",
    open: "Open",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return (
    <Badge variant={variantMap[status] || "default"}>
      {labelMap[status] || status}
    </Badge>
  );
}
