'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CheckCircle, AlertTriangle, DollarSign, TrendingUp, Star } from 'lucide-react';

interface OptimizationScenario {
  mode: string;
  total_cost: number;
  total_hours: number;
  overall_cplh: number;
  service_quality_score: number;
  labor_percentage: number;
  cost_savings: number;
  margin_improvement: number;
  violations: string[];
  trade_offs: {
    vs_current: string;
    pros: string[];
    cons: string[];
  };
  recommended?: boolean;
}

interface OptimizationScenarioComparisonProps {
  scenarios: OptimizationScenario[];
  onSelect: (mode: string) => void;
  selected?: string;
}

export function OptimizationScenarioComparison({
  scenarios,
  onSelect,
  selected
}: OptimizationScenarioComparisonProps) {
  const getScenarioTitle = (mode: string) => {
    switch (mode) {
      case 'minimize_cost': return 'Minimize Cost';
      case 'maximize_quality': return 'Maximum Quality';
      case 'balanced': return 'Balanced';
      case 'maximize_covers_per_lh': return 'Maximum Efficiency';
      default: return mode;
    }
  };

  const getScenarioIcon = (mode: string) => {
    switch (mode) {
      case 'minimize_cost': return <DollarSign className="h-5 w-5" />;
      case 'maximize_quality': return <Star className="h-5 w-5" />;
      case 'balanced': return <TrendingUp className="h-5 w-5" />;
      default: return <TrendingUp className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose Your Optimization Strategy</h2>
        <p className="text-muted-foreground mt-2">
          Compare three approaches to labor scheduling optimization
        </p>
      </div>

      <RadioGroup value={selected} onValueChange={onSelect}>
        <div className="grid gap-6 md:grid-cols-3">
          {scenarios.map((scenario) => {
            const isSelected = selected === scenario.mode;
            const isRecommended = scenario.recommended;

            return (
              <Card
                key={scenario.mode}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary shadow-lg scale-105'
                    : 'hover:border-primary/50'
                } ${
                  isRecommended ? 'border-2 border-green-500' : ''
                }`}
                onClick={() => onSelect(scenario.mode)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={scenario.mode} id={scenario.mode} />
                      <Label htmlFor={scenario.mode} className="cursor-pointer">
                        {getScenarioTitle(scenario.mode)}
                      </Label>
                    </div>
                    {isRecommended && (
                      <Badge variant="default" className="bg-green-600">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    {getScenarioIcon(scenario.mode)}
                    {scenario.trade_offs.vs_current}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Key Metrics */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Cost</span>
                      <span className="font-mono font-medium">
                        ${scenario.total_cost.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Labor Hours</span>
                      <span className="font-mono font-medium">
                        {scenario.total_hours.toFixed(1)}h
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">CPLH</span>
                      <span className="font-mono font-medium">
                        {scenario.overall_cplh.toFixed(1)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Quality Score</span>
                      <span className="font-mono font-medium">
                        {(scenario.service_quality_score * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Labor %</span>
                      <span className="font-mono font-medium">
                        {scenario.labor_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Savings/Cost */}
                  <div className={`p-3 rounded-lg ${
                    scenario.cost_savings > 0
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="text-sm font-medium mb-1">
                      {scenario.cost_savings > 0 ? 'Savings' : 'Additional Cost'}
                    </div>
                    <div className={`text-2xl font-bold ${
                      scenario.cost_savings > 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      ${Math.abs(scenario.cost_savings).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {scenario.margin_improvement > 0 ? '+' : ''}
                      {scenario.margin_improvement.toFixed(1)} point margin
                    </div>
                  </div>

                  {/* Violations */}
                  {scenario.violations.length > 0 && (
                    <div className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <span className="font-medium">{scenario.violations.length} violation(s)</span>
                        <div className="text-muted-foreground">{scenario.violations[0]}</div>
                      </div>
                    </div>
                  )}

                  {/* Pros */}
                  <div>
                    <div className="text-sm font-medium text-green-700 mb-2">Advantages</div>
                    <ul className="space-y-1">
                      {scenario.trade_offs.pros.slice(0, 3).map((pro, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Cons */}
                  <div>
                    <div className="text-sm font-medium text-red-700 mb-2">Trade-offs</div>
                    <ul className="space-y-1">
                      {scenario.trade_offs.cons.slice(0, 3).map((con, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs">
                          <AlertTriangle className="h-3 w-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Side-by-Side Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Metric</th>
                  {scenarios.map((s) => (
                    <th key={s.mode} className="text-center py-2 px-4">
                      {getScenarioTitle(s.mode)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b">
                  <td className="py-2 px-4 font-medium">Total Cost</td>
                  {scenarios.map((s) => (
                    <td key={s.mode} className="text-center py-2 px-4 font-mono">
                      ${s.total_cost.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-4 font-medium">CPLH</td>
                  {scenarios.map((s) => (
                    <td key={s.mode} className="text-center py-2 px-4 font-mono">
                      {s.overall_cplh.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-4 font-medium">Quality Score</td>
                  {scenarios.map((s) => (
                    <td key={s.mode} className="text-center py-2 px-4 font-mono">
                      {(s.service_quality_score * 100).toFixed(0)}%
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-4 font-medium">Labor %</td>
                  {scenarios.map((s) => (
                    <td key={s.mode} className="text-center py-2 px-4 font-mono">
                      {s.labor_percentage.toFixed(1)}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium">Savings</td>
                  {scenarios.map((s) => (
                    <td
                      key={s.mode}
                      className={`text-center py-2 px-4 font-mono font-bold ${
                        s.cost_savings > 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      ${Math.abs(s.cost_savings).toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
