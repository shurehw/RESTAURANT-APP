'use client';

/**
 * Context Band Component
 * Shaded strip showing active venue & date
 * Provides operational context at a glance
 */

import { Calendar, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ContextBandProps {
  venueName: string;
  date: string;
  additionalContext?: React.ReactNode;
  className?: string;
}

export function ContextBand({
  venueName,
  date,
  additionalContext,
  className = '',
}: ContextBandProps) {
  const [iconStroke, setIconStroke] = useState(1.25);

  useEffect(() => {
    // Safe client-side only access to getComputedStyle
    const stroke = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--icon-stroke') || '1.25'
    );
    setIconStroke(stroke);
  }, []);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      className={`border-b ${className}`}
      style={{
        backgroundColor: 'var(--paper-gray)',
        borderColor: 'var(--ledger-gold)',
        borderBottomWidth: '1px',
      }}
    >
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Venue */}
            <div className="flex items-center gap-2">
              <MapPin
                className="text-gray-500"
                size={16}
                strokeWidth={iconStroke}
              />
              <span className="text-sm font-medium text-gray-900">{venueName}</span>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2">
              <Calendar
                className="text-gray-500"
                size={16}
                strokeWidth={iconStroke}
              />
              <span className="text-sm text-gray-700">{formatDate(date)}</span>
            </div>
          </div>

          {/* Additional context (optional) */}
          {additionalContext && (
            <div className="flex items-center gap-4">
              {additionalContext}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Context Badge
 * Small inline badge for additional context items
 */

interface ContextBadgeProps {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'warning' | 'critical';
}

export function ContextBadge({ label, value, variant = 'default' }: ContextBadgeProps) {
  const variantStyles = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-50 text-green-700',
    warning: 'bg-yellow-50 text-yellow-700',
    critical: 'bg-red-50 text-red-700',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded ${variantStyles[variant]}`}>
      <span className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
