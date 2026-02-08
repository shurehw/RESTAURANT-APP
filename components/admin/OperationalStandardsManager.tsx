'use client';

import { useState, useEffect } from 'react';
import { LaborStandardsForm } from './LaborStandardsForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { InfoIcon, ShieldAlert } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
}

interface Props {
  organizations: Organization[];
}

export function OperationalStandardsManager({ organizations }: Props) {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(
    organizations[0] || null
  );
  const [standards, setStandards] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrg) {
      loadStandards(selectedOrg.id);
    }
  }, [selectedOrg]);

  async function loadStandards(orgId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/operational-standards?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setStandards(data.data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to load standards');
      }
    } catch (error) {
      console.error('Failed to load standards:', error);
      setError('Network error loading standards');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveStandards(updates: any) {
    if (!selectedOrg) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/operational-standards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: selectedOrg.id,
          updates,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStandards(data.data);
        alert(`✅ Standards updated successfully to version ${data.version}`);
      } else {
        const error = await res.json();
        setError(error.error || 'Failed to update standards');
        alert(`❌ Failed to update standards: ${error.error}`);
      }
    } catch (error) {
      setError('Network error updating standards');
      alert('❌ Network error updating standards');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (organizations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No organizations found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Organization</CardTitle>
          <CardDescription>Choose an organization to configure its operational standards</CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={selectedOrg?.id || ''}
            onChange={(e) => {
              const org = organizations.find((o) => o.id === e.target.value);
              setSelectedOrg(org || null);
            }}
            className="w-full max-w-md px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          {standards && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline">Version {standards.version}</Badge>
              <span className="text-sm text-muted-foreground">
                Last updated: {new Date(standards.updated_at).toLocaleString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Standards Configuration */}
      {loading && !standards ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading standards...</p>
        </div>
      ) : !standards ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No standards found for this organization</p>
        </div>
      ) : (
        <Tabs defaultValue="labor" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="labor">Labor</TabsTrigger>
            <TabsTrigger value="comp">Comp</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </TabsList>

          {/* Labor Standards Tab */}
          <TabsContent value="labor" className="space-y-4">
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>OpsOS Layer 1 Bounds:</strong> These are non-negotiable enforcement boundaries.
                Your calibration must stay within these ranges.
              </AlertDescription>
            </Alert>

            <LaborStandardsForm
              standards={standards.labor}
              onSave={handleSaveStandards}
              loading={loading}
            />
          </TabsContent>

          {/* Comp Standards Tab */}
          <TabsContent value="comp" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Comp Standards</CardTitle>
                <CardDescription>
                  Comp policy settings are managed in the{' '}
                  <a href="/admin/comp-settings" className="text-blue-600 hover:underline">
                    Comp Settings
                  </a>{' '}
                  page
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Current Comp Settings:</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">High Value Threshold</p>
                      <p className="text-lg font-semibold">${standards.comp?.high_value_comp_threshold || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Server Max Amount</p>
                      <p className="text-lg font-semibold">${standards.comp?.server_max_comp_amount || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Daily % Warning</p>
                      <p className="text-lg font-semibold">{standards.comp?.daily_comp_pct_warning || 0}%</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Daily % Critical</p>
                      <p className="text-lg font-semibold">{standards.comp?.daily_comp_pct_critical || 0}%</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <a
                      href="/admin/comp-settings"
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      Configure Comp Settings →
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Standards Overview</CardTitle>
                <CardDescription>Complete view of all enforcement standards</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Labor Overview */}
                <div>
                  <h3 className="font-semibold mb-3">Labor Standards</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Target Labor %</p>
                      <p className="font-medium">{standards.labor?.target_labor_pct || 0}% ± {standards.labor?.labor_pct_tolerance || 0}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">SPLH Floor</p>
                      <p className="font-medium">${standards.labor?.splh_floor || 0}/hr</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">CPLH Target</p>
                      <p className="font-medium">{standards.labor?.cplh_target || 0} ± {standards.labor?.cplh_tolerance || 0}</p>
                    </div>
                  </div>
                </div>

                {/* Comp Overview */}
                <div>
                  <h3 className="font-semibold mb-3">Comp Standards</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">High Value</p>
                      <p className="font-medium">${standards.comp?.high_value_comp_threshold || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Server Max</p>
                      <p className="font-medium">${standards.comp?.server_max_comp_amount || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Daily Budget</p>
                      <p className="font-medium">{standards.comp?.daily_comp_pct_warning || 0}% / {standards.comp?.daily_comp_pct_critical || 0}%</p>
                    </div>
                  </div>
                </div>

                {/* Version Info */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Effective From</p>
                      <p className="font-medium">{new Date(standards.effective_from).toLocaleDateString()}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-muted-foreground">Version</p>
                      <p className="font-medium">{standards.version}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
