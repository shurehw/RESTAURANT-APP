'use client';

import { useState, useEffect } from 'react';
import { Activity, AlertCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface IntegrationHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastChecked: Date;
  message?: string;
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'down';
  integrations: IntegrationHealth[];
  lastChecked: Date;
}

export function IntegrationStatus() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/integrations/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (error) {
      console.error('Failed to fetch integration health:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 60 seconds
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !health) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="hidden sm:inline">Checking...</span>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (health.overall) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'down':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusText = () => {
    switch (health.overall) {
      case 'healthy':
        return 'All Systems Operational';
      case 'degraded':
        return 'Some Issues Detected';
      case 'down':
        return 'System Down';
    }
  };

  const getStatusColor = () => {
    switch (health.overall) {
      case 'healthy':
        return 'text-green-600';
      case 'degraded':
        return 'text-yellow-600';
      case 'down':
        return 'text-red-600';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted transition-colors ${getStatusColor()}`}
        title="Integration Status"
      >
        {getStatusIcon()}
        <span className="hidden sm:inline text-sm font-medium">{getStatusText()}</span>
      </button>

      {showDetails && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDetails(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-border z-50">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Integration Status</h3>
                <button
                  onClick={fetchHealth}
                  className="p-1 hover:bg-muted rounded"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last checked: {new Date(health.lastChecked).toLocaleTimeString()}
              </p>
            </div>

            <div className="p-2 space-y-1">
              {health.integrations.map((integration) => (
                <div
                  key={integration.name}
                  className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {integration.status === 'healthy' && (
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    )}
                    {integration.status === 'degraded' && (
                      <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                    )}
                    {integration.status === 'down' && (
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    )}
                    {integration.status === 'unknown' && (
                      <Activity className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {integration.message || integration.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {health.overall !== 'healthy' && (
              <div className="p-3 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Issues detected. Contact support if problems persist.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
