'use client';

import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Violation {
  id: string;
  violation_type: string;
  severity: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  business_date: string;
  detected_at: string;
  action_count: number;
  block_count: number;
}

interface ViolationFeedProps {
  critical: Violation[];
  warnings: Violation[];
  info: Violation[];
}

export function ViolationFeed({ critical, warnings, info }: ViolationFeedProps) {
  return (
    <div className="space-y-6">
      {/* Critical Section */}
      {critical.length > 0 && (
        <ViolationSection
          title="Critical"
          violations={critical}
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          headerClass="bg-red-50 border-red-200"
          itemClass="border-l-4 border-l-red-500"
        />
      )}

      {/* Warnings Section */}
      {warnings.length > 0 && (
        <ViolationSection
          title="Warnings"
          violations={warnings}
          icon={<AlertCircle className="h-5 w-5 text-yellow-600" />}
          headerClass="bg-yellow-50 border-yellow-200"
          itemClass="border-l-4 border-l-yellow-500"
        />
      )}

      {/* Info Section */}
      {info.length > 0 && (
        <ViolationSection
          title="Info"
          violations={info}
          icon={<Info className="h-5 w-5 text-blue-600" />}
          headerClass="bg-blue-50 border-blue-200"
          itemClass="border-l-4 border-l-blue-500"
        />
      )}

      {critical.length === 0 && warnings.length === 0 && info.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No active violations</p>
          <p className="text-sm">All systems operating within standards</p>
        </div>
      )}
    </div>
  );
}

interface ViolationSectionProps {
  title: string;
  violations: Violation[];
  icon: React.ReactNode;
  headerClass: string;
  itemClass: string;
}

function ViolationSection({
  title,
  violations,
  icon,
  headerClass,
  itemClass,
}: ViolationSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Section Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-4 border-b ${headerClass}`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-semibold">
            {title} ({violations.length})
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5" />
        ) : (
          <ChevronDown className="h-5 w-5" />
        )}
      </button>

      {/* Violations List */}
      {expanded && (
        <div className="divide-y">
          {violations.map((violation) => (
            <ViolationItem
              key={violation.id}
              violation={violation}
              className={itemClass}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ViolationItemProps {
  violation: Violation;
  className?: string;
}

function ViolationItem({ violation, className }: ViolationItemProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`p-4 hover:bg-gray-50 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Title and Venue */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium">{violation.title}</h3>
            {violation.venue_name && (
              <span className="text-sm text-muted-foreground">
                — {violation.venue_name}
              </span>
            )}
          </div>

          {/* Description (first line or toggle) */}
          {violation.description && (
            <p className="text-sm text-muted-foreground mb-2">
              {showDetails
                ? violation.description
                : violation.description.slice(0, 120) +
                  (violation.description.length > 120 ? '...' : '')}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="capitalize">
              {violation.violation_type.replace('_', ' ')}
            </span>
            <span>
              {formatDistanceToNow(new Date(violation.detected_at), {
                addSuffix: true,
              })}
            </span>
            {violation.action_count > 0 && (
              <span>⚠️ {violation.action_count} actions</span>
            )}
            {violation.block_count > 0 && (
              <span>🚫 {violation.block_count} blocks</span>
            )}
          </div>
        </div>

        {/* Toggle Details */}
        {violation.description && violation.description.length > 120 && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-blue-600 hover:underline ml-4"
          >
            {showDetails ? 'Less' : 'More'}
          </button>
        )}
      </div>
    </div>
  );
}
