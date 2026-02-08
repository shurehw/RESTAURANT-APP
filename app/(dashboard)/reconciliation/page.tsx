export const dynamic = 'force-dynamic';

/**
 * Vendor Statement Reconciliation Dashboard
 * Shows all vendor statements with match statistics
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
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { StatementUploadButton } from "@/components/reconciliation/StatementUploadButton";

export default async function ReconciliationPage() {
  const supabase = await createClient();

  // Fetch vendors and venues for upload dialog
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name")
    .order("name");

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // Fetch vendor statements with match statistics
  const { data: statements } = await supabase
    .from("vendor_statements")
    .select(`
      id,
      statement_number,
      statement_period_start,
      statement_period_end,
      statement_total,
      reconciled,
      created_at,
      vendors (
        name
      ),
      venues (
        name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  // Get match stats for each statement
  const statementsWithStats = await Promise.all(
    (statements || []).map(async (stmt) => {
      const { data: lines } = await supabase
        .from("vendor_statement_lines")
        .select("matched, requires_review")
        .eq("vendor_statement_id", stmt.id);

      const totalLines = lines?.length || 0;
      const matchedLines = lines?.filter((l) => l.matched).length || 0;
      const reviewLines = lines?.filter((l) => l.requires_review).length || 0;

      return {
        ...stmt,
        total_lines: totalLines,
        matched_lines: matchedLines,
        review_required: reviewLines,
        match_rate: totalLines > 0 ? (matchedLines / totalLines) * 100 : 0,
      };
    })
  );

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Vendor Statement Reconciliation</h1>
          <p className="text-muted-foreground">
            Three-way match: PO → Receipt → Invoice
          </p>
        </div>

        <StatementUploadButton vendors={vendors || []} venues={venues || []} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="border border-border rounded-md p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Statements</div>
          <div className="text-2xl font-bold">{statements?.length || 0}</div>
        </div>
        <div className="border border-border rounded-md p-4">
          <div className="text-sm text-muted-foreground mb-1">Reconciled</div>
          <div className="text-2xl font-bold text-green-600">
            {statements?.filter((s) => s.reconciled).length || 0}
          </div>
        </div>
        <div className="border border-border rounded-md p-4">
          <div className="text-sm text-muted-foreground mb-1">Pending Review</div>
          <div className="text-2xl font-bold text-yellow-600">
            {statementsWithStats.reduce((sum, s) => sum + s.review_required, 0)}
          </div>
        </div>
        <div className="border border-border rounded-md p-4">
          <div className="text-sm text-muted-foreground mb-1">Avg Match Rate</div>
          <div className="text-2xl font-bold">
            {statementsWithStats.length > 0
              ? (
                  statementsWithStats.reduce((sum, s) => sum + s.match_rate, 0) /
                  statementsWithStats.length
                ).toFixed(1)
              : 0}
            %
          </div>
        </div>
      </div>

      {/* Statements Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Statement #</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Lines</TableHead>
              <TableHead className="text-center">Match Rate</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statementsWithStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <div>No vendor statements imported yet</div>
                  <div className="text-sm mt-1">Import your first statement to begin reconciliation</div>
                </TableCell>
              </TableRow>
            ) : (
              statementsWithStats.map((stmt) => (
                <TableRow key={stmt.id}>
                  <TableCell className="font-medium">
                    {(stmt.vendors as any)?.name || "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {stmt.statement_number || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(stmt.statement_period_start).toLocaleDateString()} -{" "}
                    {new Date(stmt.statement_period_end).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    ${stmt.statement_total.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground">
                      {stmt.matched_lines} / {stmt.total_lines}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div
                        className="h-2 w-24 bg-muted rounded-full overflow-hidden"
                      >
                        <div
                          className={`h-full ${
                            stmt.match_rate >= 90
                              ? "bg-green-500"
                              : stmt.match_rate >= 70
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${stmt.match_rate}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">
                        {stmt.match_rate.toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {stmt.reconciled ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Reconciled
                      </Badge>
                    ) : stmt.review_required > 0 ? (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Review ({stmt.review_required})
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/reconciliation/${stmt.id}`}>
                        Review
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
