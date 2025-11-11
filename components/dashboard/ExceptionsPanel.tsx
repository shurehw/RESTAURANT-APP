'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, Package, FileText, X } from 'lucide-react';
import { LedgerStripe } from '@/components/ui/LedgerStripe';

interface Exception {
  exception_type: string;
  venue_id: string;
  venue_name: string;
  business_date: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metadata: Record<string, any>;
}

interface ExceptionsPanelProps {
  venueId?: string;
  className?: string;
}

const severityColors = {
  critical: 'bg-red-50 border-red-200 text-red-900',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-900',
  info: 'bg-blue-50 border-blue-200 text-blue-900',
};

const severityBadges = {
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
};

const exceptionIcons = {
  labor_overage: AlertTriangle,
  cogs_high: TrendingDown,
  sales_low: TrendingDown,
  prime_cost_high: AlertTriangle,
  low_stock: Package,
  pending_approval: FileText,
};

const ICON_STROKE = 1.25;

export function ExceptionsPanel({ venueId, className = '' }: ExceptionsPanelProps) {
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  useEffect(() => {
    fetchExceptions();
    const interval = setInterval(fetchExceptions, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [venueId, filter]);

  const fetchExceptions = async () => {
    try {
      const params = new URLSearchParams();
      if (venueId) params.append('venue_id', venueId);
      if (filter !== 'all') params.append('severity', filter);

      const res = await fetch(`/api/exceptions?${params}`);
      const data = await res.json();

      if (data.success) {
        setExceptions(data.data.exceptions);
        setSummary(data.data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch exceptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissException = (exception: Exception) => {
    // For now, just remove from local state
    // In production, you'd call an API to acknowledge it
    setExceptions(exceptions.filter(e => e !== exception));
  };

  if (loading) {
    return (
      <div className={`bg-white border p-6 ${className}`} style={{
        borderRadius: 'var(--radius-sharp)',
        borderColor: 'var(--ledger-gold)'
      }}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 w-1/4 mb-4" style={{ borderRadius: 'var(--radius-sm)' }}></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-100" style={{ borderRadius: 'var(--radius-sharp)' }}></div>
            <div className="h-20 bg-gray-100" style={{ borderRadius: 'var(--radius-sharp)' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border ${className}`} style={{
      borderRadius: 'var(--radius-sharp)',
      borderColor: 'var(--ledger-gold)',
      backgroundColor: 'white'
    }}>
      {/* Header */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" style={{ letterSpacing: '0.01em' }}>
              Items Requiring Attention
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              <span className="tabular-nums">{summary?.total || 0}</span> exceptions found
            </p>
          </div>

          {/* Filter buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm font-medium tabular-nums ${
                filter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              style={{
                borderRadius: 'var(--radius-sm)',
                transition: 'var(--transition-snap)'
              }}
            >
              All ({summary?.total || 0})
            </button>
            <button
              onClick={() => setFilter('critical')}
              className={`px-3 py-1 text-sm font-medium tabular-nums ${
                filter === 'critical'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
              style={{
                borderRadius: 'var(--radius-sm)',
                transition: 'var(--transition-snap)'
              }}
            >
              Critical ({summary?.critical || 0})
            </button>
            <button
              onClick={() => setFilter('warning')}
              className={`px-3 py-1 text-sm font-medium tabular-nums ${
                filter === 'warning'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
              }`}
              style={{
                borderRadius: 'var(--radius-sm)',
                transition: 'var(--transition-snap)'
              }}
            >
              Warning ({summary?.warning || 0})
            </button>
          </div>
        </div>
        <LedgerStripe />
      </div>

      {/* Exceptions list */}
      <div className="p-6">
        {exceptions.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 mb-4" style={{
              borderRadius: 'var(--radius-sharp)'
            }}>
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={ICON_STROKE}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-700 font-medium" style={{ letterSpacing: '0.01em' }}>All clear!</p>
            <p className="text-sm text-gray-500 mt-1">No exceptions requiring attention</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exceptions.map((exception, idx) => {
              const Icon = exceptionIcons[exception.exception_type as keyof typeof exceptionIcons] || AlertTriangle;

              return (
                <div
                  key={idx}
                  className={`border p-4 ${severityColors[exception.severity]}`}
                  style={{
                    borderRadius: 'var(--radius-sharp)',
                    transition: 'var(--transition-snap)'
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" strokeWidth={ICON_STROKE} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium" style={{ letterSpacing: '0.01em' }}>{exception.title}</h3>
                          <span className={`px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${severityBadges[exception.severity]}`} style={{
                            borderRadius: 'var(--radius-sm)'
                          }}>
                            {exception.severity}
                          </span>
                        </div>

                        <p className="text-sm opacity-90 mb-2">
                          {exception.description}
                        </p>

                        <div className="flex items-center gap-4 text-xs opacity-75 font-mono">
                          <span>{exception.venue_name}</span>
                          <span>•</span>
                          <span>{new Date(exception.business_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => dismissException(exception)}
                      className="p-1 hover:bg-black/5"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        transition: 'var(--transition-fast)'
                      }}
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" strokeWidth={ICON_STROKE} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
