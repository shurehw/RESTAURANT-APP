/**
 * Control Plane - Manager Action Tracking
 * Enforcement hub for AI-generated and manual action items
 */

'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  User,
  Calendar,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';

interface ManagerAction {
  id: string;
  venue_id: string;
  business_date: string;
  source_report: string;
  source_type: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'violation' | 'training' | 'process' | 'policy' | 'positive';
  title: string;
  description: string;
  action: string;
  assigned_to?: string;
  related_checks?: string[];
  related_employees?: string[];
  status: string;
  created_at: string;
  expires_at?: string;
}

export default function ControlPlanePage() {
  const { selectedVenue } = useVenue();
  const [actions, setActions] = useState<ManagerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  useEffect(() => {
    if (selectedVenue?.id && selectedVenue.id !== 'all') {
      fetchActions();
    }
  }, [selectedVenue]);

  async function fetchActions() {
    if (!selectedVenue?.id || selectedVenue.id === 'all') return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/control-plane/actions?venue_id=${selectedVenue.id}`,
        { credentials: 'include' }
      );

      if (!res.ok) {
        throw new Error('Failed to fetch actions');
      }

      const data = await res.json();
      setActions(data.actions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteAction(actionId: string) {
    setProcessingAction(actionId);

    try {
      const res = await fetch('/api/control-plane/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action_id: actionId,
          status: 'completed',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to complete action');
      }

      // Refresh actions
      await fetchActions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setProcessingAction(null);
    }
  }

  async function handleDismissAction(actionId: string) {
    setProcessingAction(actionId);

    try {
      const res = await fetch('/api/control-plane/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action_id: actionId,
          status: 'dismissed',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to dismiss action');
      }

      // Refresh actions
      await fetchActions();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setProcessingAction(null);
    }
  }

  const priorityColors = {
    urgent: {
      bg: 'bg-error/5 border-error/50',
      icon: 'text-error',
      badge: 'bg-error/20 text-error',
    },
    high: {
      bg: 'bg-yellow-500/5 border-yellow-500/50',
      icon: 'text-yellow-600',
      badge: 'bg-yellow-500/20 text-yellow-700',
    },
    medium: {
      bg: 'bg-blue-500/5 border-blue-500/50',
      icon: 'text-blue-600',
      badge: 'bg-blue-500/20 text-blue-700',
    },
    low: {
      bg: 'bg-gray-500/5 border-gray-500/50',
      icon: 'text-gray-600',
      badge: 'bg-gray-500/20 text-gray-700',
    },
  };

  const getPriorityIcon = (priority: string) => {
    if (priority === 'urgent') return XCircle;
    if (priority === 'high') return AlertTriangle;
    return Info;
  };

  const urgentActions = actions.filter((a) => a.priority === 'urgent');
  const highActions = actions.filter((a) => a.priority === 'high');
  const mediumActions = actions.filter((a) => a.priority === 'medium');
  const lowActions = actions.filter((a) => a.priority === 'low');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Control Plane</h1>
              <p className="text-muted-foreground mt-1">
                AI-powered enforcement hub for manager accountability
              </p>
            </div>
            <VenueQuickSwitcher />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {selectedVenue?.id === 'all' ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">
                Please select a specific venue to view actions
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading actions...</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-error/50 bg-error/5">
            <CardContent className="p-6">
              <p className="text-error">Error: {error}</p>
            </CardContent>
          </Card>
        ) : actions.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">All Clear!</h3>
              <p className="text-muted-foreground">
                No pending actions for {selectedVenue?.name}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-error/50 bg-error/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-error">
                    {urgentActions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Urgent</div>
                </CardContent>
              </Card>
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-yellow-700">
                    {highActions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">High Priority</div>
                </CardContent>
              </Card>
              <Card className="border-blue-500/50 bg-blue-500/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-blue-700">
                    {mediumActions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Medium</div>
                </CardContent>
              </Card>
              <Card className="border-gray-500/50 bg-gray-500/5">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-gray-700">
                    {lowActions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Low Priority</div>
                </CardContent>
              </Card>
            </div>

            {/* Action Lists by Priority */}
            {[
              { title: 'Urgent', items: urgentActions },
              { title: 'High Priority', items: highActions },
              { title: 'Medium Priority', items: mediumActions },
              { title: 'Low Priority', items: lowActions },
            ].map(
              ({ title, items }) =>
                items.length > 0 && (
                  <div key={title}>
                    <h2 className="text-xl font-semibold mb-4">{title}</h2>
                    <div className="space-y-4">
                      {items.map((action) => {
                        const colors = priorityColors[action.priority];
                        const Icon = getPriorityIcon(action.priority);

                        return (
                          <Card
                            key={action.id}
                            className={`border ${colors.bg}`}
                          >
                            <CardContent className="p-6">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1">
                                  <Icon
                                    className={`h-5 w-5 ${colors.icon} mt-0.5 flex-shrink-0`}
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <h3 className="font-semibold">
                                        {action.title}
                                      </h3>
                                      <span
                                        className={`px-2 py-0.5 text-xs font-medium rounded ${colors.badge}`}
                                      >
                                        {action.category}
                                      </span>
                                    </div>

                                    <p className="text-sm text-muted-foreground mb-3">
                                      {action.description}
                                    </p>

                                    <div className="p-3 bg-background/50 rounded text-sm mb-3">
                                      <span className="font-medium">Action: </span>
                                      {action.action}
                                    </div>

                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {action.business_date}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {new Date(action.created_at).toLocaleDateString()}
                                      </div>
                                      {action.assigned_to && (
                                        <div className="flex items-center gap-1">
                                          <User className="h-3 w-3" />
                                          {action.assigned_to}
                                        </div>
                                      )}
                                      {action.related_checks &&
                                        action.related_checks.length > 0 && (
                                          <div>
                                            Checks: {action.related_checks.join(', ')}
                                          </div>
                                        )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleCompleteAction(action.id)}
                                    disabled={processingAction === action.id}
                                  >
                                    {processingAction === action.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                    Complete
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDismissAction(action.id)}
                                    disabled={processingAction === action.id}
                                  >
                                    Dismiss
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
