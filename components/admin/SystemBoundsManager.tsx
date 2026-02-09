'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldAlert, Save, AlertTriangle } from 'lucide-react';

interface SystemBounds {
  version: number;
  labor_pct_min: number;
  labor_pct_max: number;
  labor_pct_tolerance_min: number;
  labor_pct_tolerance_max: number;
  labor_pct_absolute_escalation: number;
  splh_min: number;
  splh_max: number;
  splh_critical_multiplier: number;
  cplh_min: number;
  cplh_max: number;
  cplh_critical_tolerance: number;
  structural_exceptions_7d: number;
  structural_exceptions_14d: number;
  structural_critical_7d: number;
  effective_from: string;
  effective_to?: string;
}

interface Props {
  isSuperAdmin: boolean;
}

export function SystemBoundsManager({ isSuperAdmin }: Props) {
  const [bounds, setBounds] = useState<SystemBounds | null>(null);
  const [formData, setFormData] = useState<SystemBounds | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadBounds();
  }, []);

  useEffect(() => {
    if (bounds && formData) {
      const changed = JSON.stringify(bounds) !== JSON.stringify(formData);
      setHasChanges(changed);
    }
  }, [formData, bounds]);

  async function loadBounds() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system-bounds');
      if (res.ok) {
        const data = await res.json();
        setBounds(data.data);
        setFormData(data.data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to load system bounds');
      }
    } catch (error) {
      console.error('Failed to load system bounds:', error);
      setError('Network error loading system bounds');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!formData) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system-bounds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: formData }),
      });

      if (res.ok) {
        const data = await res.json();
        setBounds(data.data);
        setFormData(data.data);
        alert(`✅ System bounds updated to version ${data.version}`);
      } else {
        const error = await res.json();
        setError(error.error || 'Failed to update system bounds');
        alert(`❌ Failed: ${error.error}`);
      }
    } catch (error) {
      setError('Network error updating system bounds');
      alert('❌ Network error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field: keyof SystemBounds, value: number) {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
  }

  function handleReset() {
    setFormData(bounds);
    setHasChanges(false);
  }

  if (loading && !bounds) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading system bounds...</p>
      </div>
    );
  }

  if (!bounds || !formData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No system bounds found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Version Info */}
      <Card>
        <CardHeader>
          <CardTitle>Current Version</CardTitle>
          <CardDescription>Version control for system-wide enforcement bounds</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-lg px-4 py-2">Version {bounds.version}</Badge>
            <span className="text-sm text-muted-foreground">
              Effective from: {new Date(bounds.effective_from).toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Labor Percentage Bounds */}
      <Card>
        <CardHeader>
          <CardTitle>Labor Percentage Bounds</CardTitle>
          <CardDescription>
            Organizations must set their labor targets within these min/max values
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="labor_pct_min">Minimum Allowed Labor % Target</Label>
              <Input
                id="labor_pct_min"
                type="number"
                step="0.1"
                value={formData.labor_pct_min}
                onChange={(e) => handleChange('labor_pct_min', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Orgs cannot set target below this (e.g., 18%)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="labor_pct_max">Maximum Allowed Labor % Target</Label>
              <Input
                id="labor_pct_max"
                type="number"
                step="0.1"
                value={formData.labor_pct_max}
                onChange={(e) => handleChange('labor_pct_max', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Orgs cannot set target above this (e.g., 28%)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="labor_pct_tolerance_min">Min Tolerance</Label>
              <Input
                id="labor_pct_tolerance_min"
                type="number"
                step="0.1"
                value={formData.labor_pct_tolerance_min}
                onChange={(e) => handleChange('labor_pct_tolerance_min', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="labor_pct_tolerance_max">Max Tolerance</Label>
              <Input
                id="labor_pct_tolerance_max"
                type="number"
                step="0.1"
                value={formData.labor_pct_tolerance_max}
                onChange={(e) => handleChange('labor_pct_tolerance_max', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="labor_pct_absolute_escalation">Absolute Escalation</Label>
              <Input
                id="labor_pct_absolute_escalation"
                type="number"
                step="0.1"
                value={formData.labor_pct_absolute_escalation}
                onChange={(e) => handleChange('labor_pct_absolute_escalation', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-red-600">
                Critical threshold - cannot be waived
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SPLH Bounds */}
      <Card>
        <CardHeader>
          <CardTitle>SPLH (Sales Per Labor Hour) Bounds</CardTitle>
          <CardDescription>
            Financial productivity metric bounds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="splh_min">Minimum SPLH Floor</Label>
              <Input
                id="splh_min"
                type="number"
                step="1"
                value={formData.splh_min}
                onChange={(e) => handleChange('splh_min', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Orgs cannot set below this (e.g., $55)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="splh_max">Maximum SPLH Floor</Label>
              <Input
                id="splh_max"
                type="number"
                step="1"
                value={formData.splh_max}
                onChange={(e) => handleChange('splh_max', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Orgs cannot set above this (e.g., $120)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="splh_critical_multiplier">Critical Multiplier</Label>
              <Input
                id="splh_critical_multiplier"
                type="number"
                step="0.01"
                value={formData.splh_critical_multiplier}
                onChange={(e) => handleChange('splh_critical_multiplier', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-red-600">
                SPLH {'<'} floor × this = Critical
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CPLH Bounds */}
      <Card>
        <CardHeader>
          <CardTitle>CPLH (Covers Per Labor Hour) Bounds</CardTitle>
          <CardDescription>
            Operational throughput metric bounds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cplh_min">Minimum CPLH Target</Label>
              <Input
                id="cplh_min"
                type="number"
                step="0.1"
                value={formData.cplh_min}
                onChange={(e) => handleChange('cplh_min', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Orgs cannot set below this (e.g., 2.0)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cplh_max">Maximum CPLH Target</Label>
              <Input
                id="cplh_max"
                type="number"
                step="0.1"
                value={formData.cplh_max}
                onChange={(e) => handleChange('cplh_max', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Orgs cannot set above this (e.g., 6.0)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cplh_critical_tolerance">Critical Tolerance</Label>
              <Input
                id="cplh_critical_tolerance"
                type="number"
                step="0.1"
                value={formData.cplh_critical_tolerance}
                onChange={(e) => handleChange('cplh_critical_tolerance', parseFloat(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-red-600">
                CPLH {'<'} target - this = Critical
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Structural Triggers */}
      <Card>
        <CardHeader>
          <CardTitle>Structural Pattern Triggers</CardTitle>
          <CardDescription>
            Exception frequency thresholds that trigger systemic reviews
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="structural_exceptions_7d">Exceptions in 7 Days</Label>
              <Input
                id="structural_exceptions_7d"
                type="number"
                value={formData.structural_exceptions_7d}
                onChange={(e) => handleChange('structural_exceptions_7d', parseInt(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Triggers structural review (e.g., 3)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="structural_exceptions_14d">Exceptions in 14 Days</Label>
              <Input
                id="structural_exceptions_14d"
                type="number"
                value={formData.structural_exceptions_14d}
                onChange={(e) => handleChange('structural_exceptions_14d', parseInt(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Triggers structural review (e.g., 5)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="structural_critical_7d">Critical in 7 Days</Label>
              <Input
                id="structural_critical_7d"
                type="number"
                value={formData.structural_critical_7d}
                onChange={(e) => handleChange('structural_critical_7d', parseInt(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <p className="text-xs text-red-600">
                Critical exceptions trigger (e.g., 2)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Impact Warning */}
      {hasChanges && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-900">
            <strong>Warning:</strong> You have unsaved changes. These changes will affect ALL organizations
            and create a new system bounds version.
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        {hasChanges && (
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            Reset Changes
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={!isSuperAdmin || loading || !hasChanges}
          size="lg"
        >
          <Save className="mr-2 h-4 w-4" />
          {loading ? 'Saving...' : 'Save System Bounds'}
        </Button>
      </div>
    </div>
  );
}
