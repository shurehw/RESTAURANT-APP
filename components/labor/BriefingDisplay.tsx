'use client';

/**
 * Briefing Display Component
 * Shows AI-generated daily briefing with forecast changes and recommendations
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Clock,
} from 'lucide-react';

interface BriefingData {
  venueName: string;
  briefing: string;
  changes: Array<{
    change: {
      originalCovers: number;
      newCovers: number;
      originalRevenue: number;
      newRevenue: number;
      variancePercentage: number;
      date: string;
      dayOfWeek: string;
    };
    explanation: string;
  }>;
  adjustments: Array<{
    type: 'cut' | 'add';
    employeeName: string;
    position: string;
    savings: number;
    penalty: number;
    netBenefit: number;
    hoursUntilShift: number;
    reason: string;
  }>;
  totalPotentialSavings: number;
  forecastCount: number;
}

export function BriefingDisplay({ data }: { data: BriefingData }) {
  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="p-6 bg-gradient-to-br from-opsos-sage-50 to-white border-opsos-sage-200">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Morning Briefing
            </h2>
            <p className="text-sm text-gray-600">{data.venueName}</p>
          </div>
          {data.totalPotentialSavings > 0 && (
            <div className="text-right">
              <div className="text-sm text-gray-600">Potential Savings</div>
              <div className="text-2xl font-bold text-green-600">
                ${data.totalPotentialSavings.toFixed(0)}
              </div>
            </div>
          )}
        </div>

        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-line text-gray-700">
            {data.briefing}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            {data.forecastCount} forecasts reviewed
          </div>
          {data.changes.length > 0 && (
            <div className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              {data.changes.length} significant changes detected
            </div>
          )}
        </div>
      </Card>

      {/* Forecast Changes */}
      {data.changes.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Forecast Changes
          </h3>
          {data.changes.map((item, idx) => {
            const { change, explanation } = item;
            const isIncrease = change.variancePercentage > 0;

            return (
              <Card key={idx} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-gray-900">
                      {change.dayOfWeek}, {new Date(change.date).toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-500">Forecast updated</div>
                  </div>
                  <Badge
                    variant={isIncrease ? 'default' : 'secondary'}
                    className={
                      isIncrease
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }
                  >
                    {isIncrease ? (
                      <TrendingUp className="w-3 h-3 mr-1" />
                    ) : (
                      <TrendingDown className="w-3 h-3 mr-1" />
                    )}
                    {isIncrease ? '+' : ''}
                    {change.variancePercentage.toFixed(1)}%
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                  <div>
                    <div className="text-gray-500">Covers</div>
                    <div className="font-medium">
                      {change.originalCovers} → {change.newCovers}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Revenue</div>
                    <div className="font-medium">
                      ${change.originalRevenue.toFixed(0)} → $
                      {change.newRevenue.toFixed(0)}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                  {explanation}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recommended Adjustments */}
      {data.adjustments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Recommended Adjustments
          </h3>
          {data.adjustments.map((adj, idx) => (
            <Card key={idx} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={adj.type === 'cut' ? 'destructive' : 'default'}
                    >
                      {adj.type === 'cut' ? 'CUT' : 'ADD'}
                    </Badge>
                    <span className="font-medium text-gray-900">
                      {adj.employeeName}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({adj.position})
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {adj.reason}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Net Benefit</div>
                  <div className="text-lg font-bold text-green-600">
                    ${adj.netBenefit.toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <DollarSign className="w-3 h-3" />
                    {adj.type === 'cut' ? 'Savings' : 'Cost'}
                  </div>
                  <div className="font-medium">
                    ${Math.abs(adj.savings).toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <DollarSign className="w-3 h-3" />
                    Penalty
                  </div>
                  <div className="font-medium">${adj.penalty.toFixed(0)}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-3 h-3" />
                    Time
                  </div>
                  <div className="font-medium">
                    {adj.hoursUntilShift.toFixed(1)}h
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline">
                  Review
                </Button>
                <Button
                  size="sm"
                  variant={adj.type === 'cut' ? 'destructive' : 'default'}
                >
                  {adj.type === 'cut' ? 'Cut Shift' : 'Add Shift'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* No Changes */}
      {data.changes.length === 0 && data.adjustments.length === 0 && (
        <Card className="p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            All Clear!
          </h3>
          <p className="text-gray-600">
            No significant forecast changes or schedule adjustments needed for
            the next 3 days.
          </p>
        </Card>
      )}
    </div>
  );
}
