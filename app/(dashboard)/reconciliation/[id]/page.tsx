/**
 * Vendor Statement Reconciliation Detail
 * Three-way match review: PO → Receipt → Invoice
 */

import { createClient } from "@/lib/supabase/server";
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
import { CheckCircle2, AlertCircle, XCircle, Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AIMatchButton } from "@/components/reconciliation/AIMatchButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StatementDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch statement header
  const { data: statement } = await supabase
    .from("vendor_statements")
    .select(`
      *,
      vendors (
        id,
        name,
        vendor_code
      ),
      venues (
        id,
        name
      )
    `)
    .eq("id", id)
    .single();

  if (!statement) {
    redirect("/reconciliation");
  }

  // Fetch three-way match data
  const { data: matches } = await supabase
    .from("three_way_match")
    .select("*")
    .eq("vendor_statement_id", id)
    .order("line_date", { ascending: false });

  const allMatches = matches || [];
  const matchedLines = allMatches.filter((m) => m.matched);
  const unmatchedLines = allMatches.filter((m) => !m.matched);
  const reviewRequired = allMatches.filter((m) => m.requires_review);

  const matchRate = allMatches.length > 0
    ? (matchedLines.length / allMatches.length) * 100
    : 0;

  const totalVariance = allMatches.reduce(
    (sum, m) => sum + (m.abs_variance || 0),
    0
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/reconciliation">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-header">
              {(statement.vendors as any)?.name} Statement
            </h1>
            <p className="text-muted-foreground">
              {new Date(statement.statement_period_start).toLocaleDateString()} -{" "}
              {new Date(statement.statement_period_end).toLocaleDateString()}
            </p>
          </div>

          <div className="flex gap-3">
            {!statement.reconciled && (
              <Button variant="brass">
                Mark as Reconciled
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Statement Total</div>
          <div className="text-2xl font-bold">${statement.statement_total.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Lines</div>
          <div className="text-2xl font-bold">{allMatches.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Match Rate</div>
          <div className={`text-2xl font-bold ${
            matchRate >= 90 ? "text-green-600" : matchRate >= 70 ? "text-yellow-600" : "text-red-600"
          }`}>
            {matchRate.toFixed(1)}%
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Review Required</div>
          <div className="text-2xl font-bold text-yellow-600">{reviewRequired.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Variance</div>
          <div className="text-2xl font-bold">${totalVariance.toFixed(2)}</div>
        </Card>
      </div>

      {/* Match Status Filters */}
      <div className="flex gap-2 mb-4">
        <Badge variant="outline" className="cursor-pointer">
          All ({allMatches.length})
        </Badge>
        <Badge variant="outline" className="cursor-pointer bg-green-50 text-green-700">
          Matched ({matchedLines.length})
        </Badge>
        <Badge variant="outline" className="cursor-pointer bg-red-50 text-red-700">
          Unmatched ({unmatchedLines.length})
        </Badge>
        <Badge variant="outline" className="cursor-pointer bg-yellow-50 text-yellow-700">
          Review Required ({reviewRequired.length})
        </Badge>
      </div>

      {/* Three-Way Match Table */}
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Statement Amt</TableHead>
              <TableHead>PO #</TableHead>
              <TableHead className="text-right">PO/Receipt Amt</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="text-center">Match</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allMatches.map((match) => (
              <TableRow key={match.statement_line_id}>
                <TableCell className="text-sm">
                  {new Date(match.line_date).toLocaleDateString()}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {match.invoice_number || "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm">
                  {match.description}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  ${match.invoice_amount?.toFixed(2)}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {match.po_number || "—"}
                </TableCell>
                <TableCell className="text-right">
                  {match.receipt_total
                    ? `$${match.receipt_total.toFixed(2)}`
                    : match.po_total
                    ? `$${match.po_total.toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {match.variance !== null && match.variance !== undefined ? (
                    <span
                      className={
                        Math.abs(match.variance) < 1
                          ? "text-green-600"
                          : Math.abs(match.variance) < 10
                          ? "text-yellow-600"
                          : "text-red-600"
                      }
                    >
                      ${match.variance.toFixed(2)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {match.matched ? (
                    match.match_status === "matched_exact" ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Exact
                      </Badge>
                    ) : match.match_confidence && match.match_confidence >= 0.85 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {(match.match_confidence * 100).toFixed(0)}%
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {match.match_confidence ? `${(match.match_confidence * 100).toFixed(0)}%` : "Low"}
                      </Badge>
                    )
                  ) : (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      <XCircle className="w-3 h-3 mr-1" />
                      Unmatched
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!match.matched && (
                    <AIMatchButton
                      statementLineId={match.statement_line_id}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
