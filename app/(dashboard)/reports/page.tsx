/**
 * OpsOS Reports Page
 */

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BarChart3, TrendingUp, DollarSign, Package, Download } from "lucide-react";

export default async function ReportsPage() {
  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="page-header">Reports</h1>
          <p className="text-muted-foreground">
            Analytics, P&L, and operational reports
          </p>
        </div>

        <Button variant="outline">
          <Download className="w-4 h-4" />
          Export All
        </Button>
      </div>

      {/* Report Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* P&L Reports */}
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-brass/10 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-brass" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">P&L Reports</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Profit & loss, controllable P&L
              </p>
              <Button variant="ghost" size="sm" className="text-brass hover:text-brass">
                View Reports →
              </Button>
            </div>
          </div>
        </Card>

        {/* Usage Reports */}
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-sage/10 flex items-center justify-center">
              <Package className="w-6 h-6 text-sage" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Usage Reports</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Food usage, theoretical vs actual
              </p>
              <Button variant="ghost" size="sm" className="text-sage hover:text-sage">
                View Reports →
              </Button>
            </div>
          </div>
        </Card>

        {/* Sales Reports */}
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-opsos-slate-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-opsos-slate-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Sales Reports</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Sales data, forecasting
              </p>
              <Button variant="ghost" size="sm" className="text-opsos-slate-700 hover:text-opsos-slate-900">
                View Reports →
              </Button>
            </div>
          </div>
        </Card>

        {/* Purchase Reports */}
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-brass/10 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-brass" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Purchase Reports</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Spend by vendor, category
              </p>
              <Button variant="ghost" size="sm" className="text-brass hover:text-brass">
                View Reports →
              </Button>
            </div>
          </div>
        </Card>

        {/* Category Reports */}
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-sage/10 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-sage" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Category Reports</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Spend by food category
              </p>
              <Button variant="ghost" size="sm" className="text-sage hover:text-sage">
                View Reports →
              </Button>
            </div>
          </div>
        </Card>

        {/* Menu Analysis */}
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-opsos-slate-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-opsos-slate-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Menu Analysis</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Recipe profitability, PMIX
              </p>
              <Button variant="ghost" size="sm" className="text-opsos-slate-700 hover:text-opsos-slate-900">
                View Reports →
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Reports */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-4">Recent Reports</h2>
        <Card className="p-6">
          <div className="empty-state py-8">
            <div className="empty-state-icon">
              <BarChart3 className="w-8 h-8" />
            </div>
            <h3 className="empty-state-title">No reports generated yet</h3>
            <p className="empty-state-description">
              Select a report category above to get started
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
