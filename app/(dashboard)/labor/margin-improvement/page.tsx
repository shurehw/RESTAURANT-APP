'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Target, CheckCircle } from 'lucide-react';

interface MarginData {
  current_period: {
    labor_percentage: number;
    cplh: number;
    cost: number;
    revenue: number;
    service_quality: number;
  };
  baseline: {
    labor_percentage: number;
    cplh: number;
    cost: number;
    revenue: number;
    service_quality: number;
  };
  improvement: {
    labor_pct_improvement: number;
    cplh_improvement: number;
    cost_savings: number;
    margin_improvement: number;
    quality_impact: number;
  };
  annual_impact: {
    annual_savings: number;
    quarterly_savings: number;
    monthly_savings: number;
  };
  trend: Array<{
    period: string;
    labor_pct: number;
    cplh: number;
    quality_score: number;
  }>;
  recommendations: Array<{
    action: string;
    expected_impact: number;
    effort: string;
    priority: number;
    details: string;
  }>;
  summary: string;
}

export default function MarginImprovementPage() {
  const [venueId, setVenueId] = useState('');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const [data, setData] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (venueId) {
      fetchData();
    }
  }, [venueId, period]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/labor/margin-improvement?venue_id=${venueId}&period=${period}`
      );
      if (!response.ok) throw new Error('Failed to fetch margin data');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Margin Improvement</h1>
          <p className="text-muted-foreground mt-2">
            Track labor cost savings and margin optimization over time
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Venue ID</label>
              <input
                type="text"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                placeholder="Enter venue ID"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Period</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-muted-foreground">Loading margin data...</div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!venueId && !loading && (
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="text-center">
              <p className="text-muted-foreground">
                Please enter a venue ID to view margin improvement data
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Labor % Improvement</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  {data.improvement.labor_pct_improvement > 0 ? (
                    <TrendingDown className="h-6 w-6 text-green-600" />
                  ) : (
                    <TrendingUp className="h-6 w-6 text-red-600" />
                  )}
                  {Math.abs(data.improvement.labor_pct_improvement).toFixed(1)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  {data.baseline.labor_percentage.toFixed(1)}% → {data.current_period.labor_percentage.toFixed(1)}%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Cost Savings</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <DollarSign className="h-6 w-6 text-green-600" />
                  {Math.abs(data.improvement.cost_savings).toLocaleString('en-US', {
                    maximumFractionDigits: 0
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  This {period}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Annual Projection</CardDescription>
                <CardTitle className="text-3xl">
                  ${(data.annual_impact.annual_savings / 1000).toFixed(0)}K
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  ${(data.annual_impact.monthly_savings).toLocaleString()}/month
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>CPLH Improvement</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  {data.improvement.cplh_improvement > 0 ? (
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-600" />
                  )}
                  {Math.abs(data.improvement.cplh_improvement).toFixed(1)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">
                  {data.baseline.cplh.toFixed(1)} → {data.current_period.cplh.toFixed(1)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Current Period</CardTitle>
                <CardDescription>Latest {period} performance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Labor %</span>
                  <span className="font-mono font-medium">{data.current_period.labor_percentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">CPLH</span>
                  <span className="font-mono font-medium">{data.current_period.cplh.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Labor Cost</span>
                  <span className="font-mono font-medium">${data.current_period.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Quality Score</span>
                  <span className="font-mono font-medium">{(data.current_period.service_quality * 100).toFixed(0)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Baseline Period</CardTitle>
                <CardDescription>Previous {period} for comparison</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Labor %</span>
                  <span className="font-mono font-medium">{data.baseline.labor_percentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">CPLH</span>
                  <span className="font-mono font-medium">{data.baseline.cplh.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Labor Cost</span>
                  <span className="font-mono font-medium">${data.baseline.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Quality Score</span>
                  <span className="font-mono font-medium">{(data.baseline.service_quality * 100).toFixed(0)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart */}
          {data.trend && data.trend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Labor % Trend</CardTitle>
                <CardDescription>Historical labor percentage over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="period"
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      formatter={(value: number) => [value.toFixed(1) + '%', 'Labor %']}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="labor_pct"
                      stroke="#8884d8"
                      strokeWidth={2}
                      name="Labor %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {data.recommendations && data.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
                <CardDescription>Actions to further improve margins</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.recommendations.map((rec, idx) => (
                    <div key={idx} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                          <span className="font-medium">{rec.action}</span>
                        </div>
                        <Badge variant={rec.priority === 1 ? 'default' : 'outline'}>
                          Priority {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{rec.details}</p>
                      <div className="flex gap-4 text-xs">
                        <span className="text-muted-foreground">
                          Impact: <span className="font-medium text-green-600">
                            +{rec.expected_impact.toFixed(1)}%
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          Effort: <span className="font-medium capitalize">{rec.effort}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {data.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{data.summary}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
