export const dynamic = 'force-dynamic';

/**
 * Monthly/Annual Savings Dashboard
 * Shows cost savings from inventory par optimization
 */

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, DollarSign, Package, Calendar } from "lucide-react";

export default async function SavingsPage() {
  const supabase = await createClient();

  // Get current month date range
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // Get year-to-date range
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];

  // Fetch monthly savings summary
  const { data: monthlySavings } = await supabase
    .from("monthly_savings_summary")
    .select("*")
    .gte("month_start", monthStart)
    .lte("month_start", monthEnd)
    .order("total_savings", { ascending: false });

  // Fetch annual savings summary
  const { data: annualSavings } = await supabase
    .from("annual_savings_summary")
    .select("*")
    .eq("year", now.getFullYear())
    .order("total_savings", { ascending: false });

  // Fetch recent savings events
  const { data: recentEvents } = await supabase
    .from("savings_events")
    .select(`
      *,
      items (
        item_name
      ),
      venues (
        name
      )
    `)
    .order("event_date", { ascending: false })
    .limit(20);

  // Calculate totals
  const monthlyTotal = monthlySavings?.reduce((sum, s) => sum + (s.total_savings || 0), 0) || 0;
  const annualTotal = annualSavings?.reduce((sum, s) => sum + (s.total_savings || 0), 0) || 0;
  const avgMonthlySavings = annualTotal / 12;

  // Group by type
  const savingsByType = (annualSavings || []).reduce((acc: any, s: any) => {
    if (!acc[s.savings_type]) {
      acc[s.savings_type] = 0;
    }
    acc[s.savings_type] += s.total_savings || 0;
    return acc;
  }, {});

  const savingsTypeLabels: { [key: string]: string } = {
    par_optimization: "Par Optimization",
    waste_reduction: "Waste Reduction",
    price_negotiation: "Price Negotiation",
    portion_control: "Portion Control",
    theft_prevention: "Theft Prevention",
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="page-header">Cost Savings Dashboard</h1>
        <p className="text-muted-foreground">
          Track monthly and annual savings from inventory optimization
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-sm text-muted-foreground">This Month</div>
          </div>
          <div className="text-3xl font-bold text-green-600">
            ${monthlyTotal.toFixed(0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {monthlySavings?.reduce((sum, s) => sum + (s.event_count || 0), 0) || 0} events
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-sm text-muted-foreground">Year to Date</div>
          </div>
          <div className="text-3xl font-bold text-blue-600">
            ${annualTotal.toFixed(0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {annualSavings?.reduce((sum, s) => sum + (s.event_count || 0), 0) || 0} events
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-sm text-muted-foreground">Avg Per Month</div>
          </div>
          <div className="text-3xl font-bold text-purple-600">
            ${avgMonthlySavings.toFixed(0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Based on YTD data
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Package className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-sm text-muted-foreground">Annual Projection</div>
          </div>
          <div className="text-3xl font-bold text-yellow-600">
            ${(avgMonthlySavings * 12).toFixed(0)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Based on current rate
          </div>
        </Card>
      </div>

      {/* Savings by Type */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Year-to-Date Savings by Type</h2>
        <div className="space-y-3">
          {Object.entries(savingsByType).map(([type, amount]: [string, any]) => (
            <div key={type} className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <Badge variant="outline">{savingsTypeLabels[type] || type}</Badge>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${(amount / annualTotal) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-lg font-bold text-green-600 ml-4">
                ${amount.toFixed(0)}
              </div>
              <div className="text-sm text-muted-foreground ml-3 w-16 text-right">
                {((amount / annualTotal) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Savings Events */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Savings Events</h2>
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Savings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!recentEvents || recentEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No savings events recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                recentEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm">
                      {new Date(event.event_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {savingsTypeLabels[event.savings_type] || event.savings_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {(event.items as any)?.item_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {event.description}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {event.quantity ? event.quantity.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${event.savings_amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
