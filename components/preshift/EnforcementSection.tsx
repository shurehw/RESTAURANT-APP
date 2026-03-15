'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ChevronDown, ChevronUp, CheckCircle, XCircle, Eye } from 'lucide-react';

interface EnforcementItem {
  source_table: string;
  source_id: string;
  severity: string;
  title: string;
  description: string;
  age_hours?: number;
  age_label?: string;
  actions?: string[];
}

interface EnforcementCounts {
  critical?: number;
  warning?: number;
  info?: number;
  total?: number;
}

interface EnforcementSectionProps {
  items: EnforcementItem[];
  counts: EnforcementCounts;
  onAction: (sourceTable: string, sourceId: string, action: string) => Promise<void>;
}

function severityBadgeVariant(severity: string): 'error' | 'brass' | 'default' {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'brass';
    default:
      return 'default';
  }
}

function actionIcon(action: string) {
  switch (action.toLowerCase()) {
    case 'done':
    case 'resolve':
      return <CheckCircle className="h-3.5 w-3.5" />;
    case 'dismiss':
      return <XCircle className="h-3.5 w-3.5" />;
    case 'ack':
    case 'acknowledge':
      return <Eye className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

export function EnforcementSection({ items, counts, onAction }: EnforcementSectionProps) {
  const hasCritical = (counts.critical ?? 0) > 0;
  const [expanded, setExpanded] = useState(hasCritical);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const total = counts.total ?? items.length;

  async function handleAction(sourceTable: string, sourceId: string, action: string) {
    const key = `${sourceId}-${action}`;
    setLoadingAction(key);
    try {
      await onAction(sourceTable, sourceId, action);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader
        className="pb-3 print:pb-1 print:px-0 cursor-pointer print:cursor-default"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brass" />
            Enforcement
            {total > 0 && (
              <Badge variant={hasCritical ? 'error' : 'outline'} className="ml-1">
                {total}
              </Badge>
            )}
          </span>
          <span className="print:hidden">
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="print:px-0 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No open enforcement items</p>
          ) : (
            items.map((item) => (
              <div
                key={`${item.source_table}-${item.source_id}`}
                className="rounded-md border border-border p-3 space-y-2 print:border-gray-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={severityBadgeVariant(item.severity)} className="text-[10px]">
                        {item.severity.toUpperCase()}
                      </Badge>
                      <span className="font-medium text-sm truncate">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    {item.age_label && (
                      <p className="text-[10px] text-muted-foreground mt-1">{item.age_label}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {item.actions && item.actions.length > 0 && (
                    <div className="flex items-center gap-1 print:hidden flex-shrink-0">
                      {item.actions.map((action) => {
                        const key = `${item.source_id}-${action}`;
                        return (
                          <Button
                            key={action}
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={loadingAction === key}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAction(item.source_table, item.source_id, action);
                            }}
                          >
                            {actionIcon(action)}
                            {action}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}
