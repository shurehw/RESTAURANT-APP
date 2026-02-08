export const dynamic = 'force-dynamic';

/**
 * OpsOS Budget Page
 * Declining-budget chart using Recharts with brass line
 */

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetChart } from "@/components/budget/BudgetChart";
import { BudgetFilters } from "@/components/budget/BudgetFilters";
import { TrendingDown, TrendingUp, DollarSign } from "lucide-react";

export default async function BudgetPage() {
  const supabase = await createClient();

  // Fetch budget data
  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("period_start", "2024-01-01")
    .limit(1)
    .single();

  // Mock budget data for chart
  const chartData = [
    { day: "Mon", budget: 10000, actual: 0, remaining: 10000 },
    { day: "Tue", budget: 10000, actual: 1500, remaining: 8500 },
    { day: "Wed", budget: 10000, actual: 3200, remaining: 6800 },
    { day: "Thu", budget: 10000, actual: 4900, remaining: 5100 },
    { day: "Fri", budget: 10000, actual: 7200, remaining: 2800 },
    { day: "Sat", budget: 10000, actual: 9500, remaining: 500 },
    { day: "Sun", budget: 10000, actual: 10200, remaining: -200 },
  ];

  const weeklyBudget = budgets?.amount || 10000;
  const actualSpend = 10200;
  const remaining = weeklyBudget - actualSpend;
  const percentUsed = (actualSpend / weeklyBudget) * 100;
  const isOverBudget = remaining < 0;

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="page-header">Budget</h1>
        <p className="text-muted-foreground">
          Track weekly spending and budget performance
        </p>
      </div>

      {/* Filters */}
      <BudgetFilters />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-overline">Weekly Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stat-card-value">${weeklyBudget.toLocaleString()}</div>
            <div className="flex items-center gap-2 mt-2">
              <DollarSign className="w-4 h-4 text-brass" />
              <span className="text-caption text-muted-foreground">Food & Bev</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-overline">Actual Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stat-card-value">${actualSpend.toLocaleString()}</div>
            <div className={`stat-card-change ${isOverBudget ? 'negative' : 'positive'} flex items-center gap-1 mt-2`}>
              {isOverBudget ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span>{percentUsed.toFixed(1)}% of budget</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-overline">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`stat-card-value ${isOverBudget ? 'text-error' : 'text-sage'}`}>
              {isOverBudget ? '-' : ''}${Math.abs(remaining).toLocaleString()}
            </div>
            <div className={`stat-card-change ${isOverBudget ? 'negative' : 'positive'} mt-2`}>
              {isOverBudget ? 'Over budget' : `${Math.abs((remaining / weeklyBudget) * 100).toFixed(1)}% left`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Declining Budget Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Budget Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}
