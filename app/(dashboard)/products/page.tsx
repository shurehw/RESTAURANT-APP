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

export default async function ProductsPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("name", { ascending: true })
    .limit(50);

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Products</h1>
          <p className="text-muted-foreground">
            Manage food & beverage products across all venues
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline">
            <Download className="w-4 h-4" />
            Import
          </Button>
          <Button variant="brass">
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Items Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Case Size</TableHead>
              <TableHead className="text-right">Par Level</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category || "—"}</TableCell>
                <TableCell>{item.unit_of_measure || "—"}</TableCell>
                <TableCell className="text-right">{item.case_size || "—"}</TableCell>
                <TableCell className="text-right">{item.par_level || "—"}</TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-1 bg-sage/10 text-sage rounded-sm">
                    Active
                  </span>
                </TableCell>
              </TableRow>
            ))}
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
