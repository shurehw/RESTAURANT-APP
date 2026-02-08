'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// Progress component not available - using inline div instead
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface ServiceQualityScore {
  overall_score: number;
  components: {
    server_coverage: number;
    support_ratio: number;
    experience: number;
    efficiency: number;
  };
  violations: Array<{
    constraint: string;
    severity: 'warning' | 'critical';
    description: string;
    impact: string;
    current_value?: number;
    required_value?: number;
  }>;
  meets_minimum: boolean;
  recommendations: string[];
  staffing_details?: {
    servers: number;
    bussers: number;
    runners: number;
    total_covers: number;
    total_hours?: number;
  };
}

interface ServiceQualityScoreCardProps {
  venueId: string;
  date: string;
  shiftType?: string;
}

export function ServiceQualityScoreCard({ venueId, date, shiftType }: ServiceQualityScoreCardProps) {
  const [data, setData] = useState<ServiceQualityScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [venueId, date, shiftType]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ venue_id: venueId, date });
      if (shiftType) params.append('shift_type', shiftType);

      const response = await fetch(`/api/labor/service-quality/score?${params}`);
      if (!response.ok) throw new Error('Failed to fetch quality score');

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
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Loading quality score...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const scorePercentage = data.overall_score * 100;
  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600';
    if (score >= 0.8) return 'text-blue-600';
    if (score >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 border-green-300';
    if (score >= 0.8) return 'bg-blue-100 border-blue-300';
    if (score >= 0.7) return 'bg-yellow-100 border-yellow-300';
    return 'bg-red-100 border-red-300';
  };

  return (
    <div className="space-y-6">
      {/* Overall Score Display */}
      <Card className={`border-2 ${getScoreBgColor(data.overall_score)}`}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Service Quality Score</span>
            {data.meets_minimum ? (
              <CheckCircle className="h-6 w-6 text-green-600" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-600" />
            )}
          </CardTitle>
          <CardDescription>
            {shiftType ? `${shiftType.replace('_', ' ')} shift` : 'Overall day'} • {date}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className={`text-6xl font-bold ${getScoreColor(data.overall_score)}`}>
              {scorePercentage.toFixed(0)}
            </div>
            <div className="text-muted-foreground mt-2">out of 100</div>
            <div className="mt-4">
              {data.meets_minimum ? (
                <Badge variant="default" className="bg-green-600">
                  Meets Quality Standards
                </Badge>
              ) : (
                <Badge variant="error">
                  Below Minimum Standards
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Quality Components</CardTitle>
          <CardDescription>Breakdown of quality score factors</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Server Coverage (40%)</span>
              <span className="text-sm font-mono">{(data.components.server_coverage * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${data.components.server_coverage * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground">
              Max {data.staffing_details?.total_covers && data.staffing_details.servers
                ? (data.staffing_details.total_covers / data.staffing_details.servers).toFixed(1)
                : '?'} covers per server
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Support Staff Ratio (30%)</span>
              <span className="text-sm font-mono">{(data.components.support_ratio * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${data.components.support_ratio * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground">
              Busser and runner staffing levels
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Team Experience (20%)</span>
              <span className="text-sm font-mono">{(data.components.experience * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${data.components.experience * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground">
              Average staff performance rating
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Efficiency (10%)</span>
              <span className="text-sm font-mono">{(data.components.efficiency * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${data.components.efficiency * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground">
              Labor hours vs covers ratio
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Staffing Details */}
      {data.staffing_details && (
        <Card>
          <CardHeader>
            <CardTitle>Staffing Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Servers</div>
                <div className="text-2xl font-bold">{data.staffing_details.servers}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Bussers</div>
                <div className="text-2xl font-bold">{data.staffing_details.bussers}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Runners</div>
                <div className="text-2xl font-bold">{data.staffing_details.runners}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Covers</div>
                <div className="text-2xl font-bold">{data.staffing_details.total_covers}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Violations */}
      {data.violations.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Quality Violations ({data.violations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.violations.map((violation, idx) => (
              <div key={idx} className="p-3 border border-yellow-300 rounded-lg bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium">{violation.description}</div>
                  <Badge variant={violation.severity === 'critical' ? 'error' : 'outline'}>
                    {violation.severity}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">{violation.impact}</div>
                {violation.current_value !== undefined && violation.required_value !== undefined && (
                  <div className="text-xs mt-2 font-mono">
                    Current: {violation.current_value.toFixed(2)} → Required: {violation.required_value.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>Actions to improve service quality</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />
                  <span className="text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
