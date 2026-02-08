'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

interface CPLHAnalytics {
  summary: {
    overall_cplh: number;
    target_cplh: number;
    variance_pct: number;
    trend: 'improving' | 'stable' | 'declining';
    status: 'excellent' | 'on_target' | 'below_target' | 'poor';
  };
  by_position: Array<{
    position_name: string;
    actual_cplh: number;
    target_cplh: number;
    variance_pct: number;
    status: string;
    recommendation: string;
  }>;
  by_shift: Array<{
    shift_type: string;
    actual_cplh: number;
    target_cplh: number;
    variance_pct: number;
    covers: number;
    labor_hours: number;
  }>;
  timeline: Array<{
    date: string;
    cplh: number;
    covers: number;
    labor_hours: number;
  }>;
}

interface LaborEfficiencyDashboardProps {
  venueId: string;
  startDate?: string;
  endDate?: string;
}

export function LaborEfficiencyDashboard({ venueId, startDate, endDate }: LaborEfficiencyDashboardProps) {
  const [data, setData] = useState<CPLHAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [venueId, startDate, endDate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ venue_id: venueId });
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await fetch(`/api/labor/cplh/analytics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch CPLH analytics');

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading efficiency data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'bg-green-500';
      case 'on_target': return 'bg-blue-500';
      case 'below_target': return 'bg-yellow-500';
      case 'poor': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overall CPLH</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              {data.summary.overall_cplh.toFixed(1)}
              {getTrendIcon(data.summary.trend)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Target: {data.summary.target_cplh.toFixed(1)}
              <Badge className={`ml-2 ${getStatusColor(data.summary.status)}`} variant="outline">
                {data.summary.variance_pct >= 0 ? '+' : ''}{data.summary.variance_pct.toFixed(1)}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Trend</CardDescription>
            <CardTitle className="text-2xl capitalize">{data.summary.trend}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Last 30 days performance
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-2xl capitalize">{data.summary.status.replace('_', ' ')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              {data.summary.status === 'excellent' && 'Exceeding targets'}
              {data.summary.status === 'on_target' && 'Within acceptable range'}
              {data.summary.status === 'below_target' && 'Slightly overstaffed'}
              {data.summary.status === 'poor' && 'Action required'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Positions Analyzed</CardDescription>
            <CardTitle className="text-3xl">{data.by_position.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Across all shifts
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CPLH Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>CPLH Trend (Last 30 Days)</CardTitle>
          <CardDescription>Daily covers per labor hour performance</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value: number) => [value.toFixed(2), 'CPLH']}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="cplh"
                stroke="#8884d8"
                strokeWidth={2}
                name="Covers per Labor Hour"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* CPLH by Position */}
      <Card>
        <CardHeader>
          <CardTitle>CPLH by Position</CardTitle>
          <CardDescription>Performance by role compared to targets</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.by_position}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="position_name" />
              <YAxis />
              <Tooltip formatter={(value: number) => value.toFixed(1)} />
              <Legend />
              <Bar dataKey="actual_cplh" fill="#8884d8" name="Actual CPLH" />
              <Bar dataKey="target_cplh" fill="#82ca9d" name="Target CPLH" />
            </BarChart>
          </ResponsiveContainer>

          {/* Position Details Table */}
          <div className="mt-4 space-y-2">
            {data.by_position.map((pos, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{pos.position_name}</div>
                  <div className="text-sm text-muted-foreground">{pos.recommendation}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-medium">
                    {pos.actual_cplh.toFixed(1)} / {pos.target_cplh.toFixed(1)}
                  </div>
                  <Badge className={getStatusColor(pos.status)} variant="outline">
                    {pos.variance_pct >= 0 ? '+' : ''}{pos.variance_pct.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CPLH by Shift Type */}
      <Card>
        <CardHeader>
          <CardTitle>CPLH by Shift Type</CardTitle>
          <CardDescription>Efficiency across different service periods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.by_shift.map((shift, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium capitalize">{shift.shift_type.replace('_', ' ')}</div>
                  <div className="text-sm text-muted-foreground">
                    {shift.covers} covers • {shift.labor_hours.toFixed(1)} hours
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{shift.actual_cplh.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">
                    Target: {shift.target_cplh.toFixed(1)}
                    <span className={`ml-2 ${shift.variance_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({shift.variance_pct >= 0 ? '+' : ''}{shift.variance_pct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
