"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, Loader2 } from "lucide-react";

interface Vendor {
  id: string;
  name: string;
}

interface Venue {
  id: string;
  name: string;
}

interface StatementUploadButtonProps {
  vendors: Vendor[];
  venues: Venue[];
}

export function StatementUploadButton({ vendors, venues }: StatementUploadButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [statementNumber, setStatementNumber] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [statementTotal, setStatementTotal] = useState("");
  const [csvData, setCsvData] = useState("");

  const handleSubmit = async () => {
    if (!vendorId || !venueId || !periodStart || !periodEnd || !statementTotal || !csvData) {
      alert("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      // Parse CSV (simple comma-separated format)
      const lines = csvData.trim().split("\n").slice(1); // Skip header
      const parsedLines = lines.map((line, index) => {
        const [date, invoice, description, amount] = line.split(",").map((s) => s.trim());
        return {
          line_number: index + 1,
          line_date: date,
          invoice_number: invoice || undefined,
          description,
          amount: parseFloat(amount),
        };
      });

      const response = await fetch("/api/vendor-statements/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: vendorId,
          venue_id: venueId,
          statement_number: statementNumber || undefined,
          statement_period_start: periodStart,
          statement_period_end: periodEnd,
          statement_total: parseFloat(statementTotal),
          lines: parsedLines,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        alert(
          `Statement Imported Successfully!\n\n` +
            `Total Lines: ${result.total_lines}\n` +
            `Matched: ${result.matched_lines}\n` +
            `Unmatched: ${result.unmatched_lines}\n` +
            `Review Required: ${result.review_required}\n` +
            `Match Rate: ${result.match_rate}%`
        );
        setOpen(false);
        window.location.reload();
      } else {
        alert(`Import failed: ${result.message || "Unknown error"}`);
      }
    } catch (error) {
      alert("Error importing statement");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brass">
          <Upload className="w-4 h-4" />
          Import Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Vendor Statement</DialogTitle>
          <DialogDescription>
            Import a vendor statement and auto-match to purchase orders
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vendor Selection */}
          <div>
            <Label htmlFor="vendor">Vendor *</Label>
            <select
              id="vendor"
              className="w-full mt-1 p-2 border border-border rounded-md"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Venue Selection */}
          <div>
            <Label htmlFor="venue">Venue *</Label>
            <select
              id="venue"
              className="w-full mt-1 p-2 border border-border rounded-md"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              <option value="">Select venue...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Statement Number */}
          <div>
            <Label htmlFor="statement_number">Statement Number</Label>
            <Input
              id="statement_number"
              placeholder="Optional"
              value={statementNumber}
              onChange={(e) => setStatementNumber(e.target.value)}
            />
          </div>

          {/* Period Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="period_start">Period Start *</Label>
              <Input
                id="period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="period_end">Period End *</Label>
              <Input
                id="period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Statement Total */}
          <div>
            <Label htmlFor="total">Statement Total *</Label>
            <Input
              id="total"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={statementTotal}
              onChange={(e) => setStatementTotal(e.target.value)}
            />
          </div>

          {/* CSV Data */}
          <div>
            <Label htmlFor="csv">Statement Lines (CSV) *</Label>
            <div className="text-xs text-muted-foreground mb-2">
              Format: Date, Invoice#, Description, Amount
              <br />
              Example: 2025-01-15, INV-12345, Ground Beef 80/20, 245.50
            </div>
            <textarea
              id="csv"
              className="w-full mt-1 p-2 border border-border rounded-md font-mono text-sm"
              rows={8}
              placeholder="Date, Invoice#, Description, Amount&#10;2025-01-15, INV-001, Ground Beef, 245.50&#10;2025-01-16, INV-002, Chicken Breast, 189.25"
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import & Match"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
