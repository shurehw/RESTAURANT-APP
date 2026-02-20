'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  AlertCircle,
  Eye,
  Clock,
  UserX,
  ShieldAlert,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelligenceItem {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  intelligence_type: 'unfulfilled_commitment' | 'employee_pattern' | 'ownership_alert';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommended_action: string | null;
  subject_manager_id: string | null;
  subject_manager_name: string | null;
  related_employees: string[];
  status: string;
  created_at: string;
}

interface IntelligenceFeedProps {
  items: IntelligenceItem[];
  orgId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntelligenceFeed({ items, orgId }: IntelligenceFeedProps) {
  const [localItems, setLocalItems] = useState(items);
  const [actioning, setActioning] = useState<string | null>(null);

  const critical = localItems.filter(i => i.severity === 'critical');
  const warnings = localItems.filter(i => i.severity === 'warning');
  const info = localItems.filter(i => i.severity === 'info');

  async function handleAction(id: string, action: 'acknowledge' | 'resolve' | 'dismiss') {
    setActioning(id);
    try {
      const res = await fetch('/api/operator/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, org_id: orgId }),
      });
      if (res.ok) {
        setLocalItems(prev => prev.filter(i => i.id !== id));
      }
    } catch {
      // Silently fail — item stays in list
    } finally {
      setActioning(null);
    }
  }

  if (localItems.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Eye className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No active intelligence items</p>
        <p className="text-xs">Signals will appear here after attestations are submitted</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <IntelligenceSection
          title="Critical"
          items={critical}
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          borderClass="border-l-red-500"
          onAction={handleAction}
          actioning={actioning}
        />
      )}
      {warnings.length > 0 && (
        <IntelligenceSection
          title="Warnings"
          items={warnings}
          icon={<AlertCircle className="h-4 w-4 text-yellow-600" />}
          borderClass="border-l-yellow-500"
          onAction={handleAction}
          actioning={actioning}
        />
      )}
      {info.length > 0 && (
        <IntelligenceSection
          title="Info"
          items={info}
          icon={<Eye className="h-4 w-4 text-blue-600" />}
          borderClass="border-l-blue-500"
          onAction={handleAction}
          actioning={actioning}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function IntelligenceSection({
  title,
  items,
  icon,
  borderClass,
  onAction,
  actioning,
}: {
  title: string;
  items: IntelligenceItem[];
  icon: React.ReactNode;
  borderClass: string;
  onAction: (id: string, action: 'acknowledge' | 'resolve' | 'dismiss') => void;
  actioning: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {icon}
        <span>{title} ({items.length})</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="space-y-2">
          {items.map(item => (
            <IntelligenceCard
              key={item.id}
              item={item}
              borderClass={borderClass}
              onAction={onAction}
              isActioning={actioning === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ReactNode> = {
  unfulfilled_commitment: <Clock className="h-4 w-4 text-yellow-600" />,
  employee_pattern: <UserX className="h-4 w-4 text-red-600" />,
  ownership_alert: <ShieldAlert className="h-4 w-4 text-orange-600" />,
};

const TYPE_LABELS: Record<string, string> = {
  unfulfilled_commitment: 'Commitment',
  employee_pattern: 'Employee Pattern',
  ownership_alert: 'Ownership',
};

function IntelligenceCard({
  item,
  borderClass,
  onAction,
  isActioning,
}: {
  item: IntelligenceItem;
  borderClass: string;
  onAction: (id: string, action: 'acknowledge' | 'resolve' | 'dismiss') => void;
  isActioning: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`border border-border rounded-md bg-card p-4 border-l-4 ${borderClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">
            {TYPE_ICONS[item.intelligence_type] || <Eye className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{item.title}</span>
              <Badge variant="outline" className="text-[10px]">
                {TYPE_LABELS[item.intelligence_type] || item.intelligence_type}
              </Badge>
            </div>

            {item.subject_manager_name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Manager: {item.subject_manager_name}
              </p>
            )}

            <p className="text-sm text-muted-foreground mt-1">
              {showDetails
                ? item.description
                : item.description.length > 140
                  ? item.description.slice(0, 140) + '...'
                  : item.description}
            </p>

            {item.description.length > 140 && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-brass hover:underline mt-0.5"
              >
                {showDetails ? 'Less' : 'More'}
              </button>
            )}

            {showDetails && item.recommended_action && (
              <p className="text-xs text-muted-foreground mt-2 border-t pt-2">
                <span className="font-medium">Recommended:</span> {item.recommended_action}
              </p>
            )}

            {item.related_employees.length > 0 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {item.related_employees.map(emp => (
                  <Badge key={emp} variant="default" className="text-[10px]">
                    {emp}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{item.business_date}</span>
              <span>
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onAction(item.id, 'resolve')}
            disabled={isActioning}
            className="p-1.5 rounded-md hover:bg-sage/10 text-sage transition-colors disabled:opacity-50"
            title="Resolve"
          >
            <CheckCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => onAction(item.id, 'dismiss')}
            disabled={isActioning}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
