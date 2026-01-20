"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw, Database, Shield } from "lucide-react";

interface SettingsError {
  error: string;
  code: "SETTINGS_MISSING" | "SETTINGS_QUERY_FAILED" | "GLOBAL_IMMUTABLE";
  details?: string;
  remediation?: string;
  action?: string;
}

interface SettingsErrorBoundaryProps {
  orgId: string;
  children: React.ReactNode;
}

export function SettingsErrorBoundary({
  orgId,
  children,
}: SettingsErrorBoundaryProps) {
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState<SettingsError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, [orgId]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/proforma/labor-settings?org_id=${orgId}`);
      const data = await response.json();

      if (response.status === 503) {
        // P0: Hard failure - settings missing or query failed
        setError(data as SettingsError);
        setSettings(null);
      } else if (response.status === 403) {
        // P0: Global immutability violation
        setError(data as SettingsError);
        setSettings(null);
      } else if (response.ok) {
        setSettings(data.settings);
        setError(null);
      } else {
        throw new Error(data.error || "Failed to fetch settings");
      }
    } catch (err: any) {
      setError({
        error: err.message,
        code: "SETTINGS_QUERY_FAILED",
        remediation: "Check your network connection and try again",
      });
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/proforma/labor-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });

      if (response.ok) {
        fetchSettings();
      } else {
        const data = await response.json();
        alert(`Failed to initialize settings: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  // P0: SETTINGS_MISSING Error
  if (error?.code === "SETTINGS_MISSING") {
    return (
      <Card className="p-8">
        <Alert variant="destructive">
          <Database className="h-4 w-4" />
          <AlertTitle className="text-lg">Settings Not Configured</AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            <p>{error.error}</p>
            {error.remediation && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                <p className="text-sm font-medium text-red-900 mb-1">
                  What to do:
                </p>
                <p className="text-sm text-red-800">{error.remediation}</p>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleInitializeSettings} disabled={loading}>
                <Database className="h-4 w-4 mr-2" />
                Initialize Settings
              </Button>
              <Button variant="outline" onClick={fetchSettings}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  // P0: SETTINGS_QUERY_FAILED Error
  if (error?.code === "SETTINGS_QUERY_FAILED") {
    return (
      <Card className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-lg">Database Query Failed</AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            <p>{error.error}</p>
            {error.details && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                <p className="text-sm font-mono text-red-800">{error.details}</p>
              </div>
            )}
            {error.remediation && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                <p className="text-sm font-medium text-red-900 mb-1">
                  Administrator Action Required:
                </p>
                <p className="text-sm font-mono text-red-800">{error.remediation}</p>
              </div>
            )}
            <Button variant="outline" onClick={fetchSettings}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  // P0: GLOBAL_IMMUTABLE Error
  if (error?.code === "GLOBAL_IMMUTABLE") {
    return (
      <Card className="p-8">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle className="text-lg">Global Setting - Read Only</AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            <p>{error.error}</p>
            {error.remediation && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  How to customize:
                </p>
                <p className="text-sm text-blue-800">{error.remediation}</p>
              </div>
            )}
            {error.action === "create_tenant_override" && (
              <Button onClick={() => alert("Create override functionality coming soon")}>
                Create Organization Override
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  // All good - render children with settings
  if (settings) {
    return <>{children}</>;
  }

  // Unknown error
  return (
    <Card className="p-8">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unknown Error</AlertTitle>
        <AlertDescription>
          <p>An unexpected error occurred.</p>
          <Button variant="outline" onClick={fetchSettings} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </Card>
  );
}
