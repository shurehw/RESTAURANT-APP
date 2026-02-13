'use client';

/**
 * Requirements Display Component
 * Shows calculated labor requirements with ability to recalculate
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface Requirement {
  id: string;
  business_date: string;
  shift_type: string;
  employees_needed: number;
  hours_per_employee: number;
  total_hours: number;
  total_cost: number;
  labor_percentage: number;
  within_target: boolean;
  position: {
    name: string;
    category: string;
    base_hourly_rate: number;
  };
  forecast: {
    business_date: string;
    shift_type: string;
    covers_predicted: number;
    revenue_predicted: number;
  };
}

interface Props {
  requirements: Requirement[];
  venueId: string;
  laborTarget: number;
}

export function RequirementsDisplay({ requirements, venueId, laborTarget }: Props) {
  const [calculating, setCalculating] = useState(false);
  const [calculationOutput, setCalculationOutput] = useState<string | null>(null);

  // Group by date and shift
  const grouped = requirements.reduce((acc: any, req: any) => {
    const key = `${req.business_date}_${req.shift_type}`;
    if (!acc[key]) {
      acc[key] = {
        business_date: req.business_date,
        shift_type: req.shift_type,
        forecast: req.forecast,
        positions: [],
        total_cost: 0,
        total_hours: 0,
        total_employees: 0,
        labor_percentage: req.labor_percentage,
        within_target: req.within_target,
      };
    }
    acc[key].positions.push({
      name: req.position.name,
      category: req.position.category,
      employees_needed: req.employees_needed,
      hours_per_employee: req.hours_per_employee,
      total_hours: req.total_hours,
      total_cost: req.total_cost,
      hourly_rate: req.position.base_hourly_rate,
    });
    acc[key].total_cost += req.total_cost || 0;
    acc[key].total_hours += req.total_hours || 0;
    acc[key].total_employees += req.employees_needed || 0;
    return acc;
  }, {});

  const shifts = Object.values(grouped);

  const handleRecalculate = async () => {
    setCalculating(true);
    setCalculationOutput(null);

    try {
      const response = await fetch('/api/labor/requirements/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          days_ahead: 7,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCalculationOutput(data.stdout);
        // Reload page to show new data
        window.location.reload();
      } else {
        alert(data.message || data.error || 'Operation failed');
      }
    } catch (error) {
      console.error('Calculation error:', error);
      alert('Failed to calculate requirements');
    } finally {
      setCalculating(false);
    }
  };

  if (shifts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Calculator className="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Requirements Calculated
        </h3>
        <p className="text-gray-600 mb-4">
          Run the calculator to generate staffing requirements from your forecasts
        </p>
        <Button onClick={handleRecalculate} disabled={calculating}>
          {calculating ? 'Calculating...' : 'Calculate Requirements'}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {shifts.length} shifts with calculated requirements
          </div>
          <Button onClick={handleRecalculate} disabled={calculating} size="sm">
            <Calculator className="w-4 h-4 mr-2" />
            {calculating ? 'Recalculating...' : 'Recalculate'}
          </Button>
        </div>
      </Card>

      {/* Calculation Output */}
      {calculationOutput && (
        <Card className="p-4 bg-gray-50">
          <div className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
            {calculationOutput}
          </div>
        </Card>
      )}

      {/* Requirements by Shift */}
      {shifts.map((shift: any, idx: number) => {
        const date = new Date(shift.business_date);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        return (
          <Card key={idx} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {dayOfWeek}, {dateStr}
                  </h3>
                  <Badge variant="outline" className="capitalize">
                    {shift.shift_type}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {shift.forecast?.covers_predicted || 0} covers
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    ${(shift.forecast?.revenue_predicted || 0).toFixed(0)} revenue
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-500 mb-1">Labor %</div>
                <div className="flex items-center gap-2">
                  <div
                    className={`text-2xl font-bold ${
                      shift.within_target
                        ? 'text-green-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {shift.labor_percentage?.toFixed(1)}%
                  </div>
                  {shift.within_target ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Target: {laborTarget}%
                </div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm text-gray-500">Total Employees</div>
                <div className="text-xl font-semibold text-gray-900">
                  {shift.total_employees}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Hours</div>
                <div className="text-xl font-semibold text-gray-900">
                  {shift.total_hours.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Cost</div>
                <div className="text-xl font-semibold text-gray-900">
                  ${shift.total_cost.toFixed(0)}
                </div>
              </div>
            </div>

            {/* Position Breakdown */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 mb-2">
                Staffing by Position
              </div>
              {shift.positions.map((pos: any, pidx: number) => (
                <div
                  key={pidx}
                  className="flex items-center justify-between p-3 bg-white border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium text-gray-900">{pos.name}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {pos.category.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <div className="text-gray-500">Staff</div>
                      <div className="font-medium">{pos.employees_needed}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Hours</div>
                      <div className="font-medium">
                        {pos.hours_per_employee}h × {pos.employees_needed}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500">Rate</div>
                      <div className="font-medium">${pos.hourly_rate}/hr</div>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="text-gray-500">Cost</div>
                      <div className="font-semibold text-gray-900">
                        ${pos.total_cost.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
