'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoIcon, Save } from 'lucide-react';

// OpsOS Layer 1 Bounds (non-negotiable)
const LABOR_BOUNDS = {
  LABOR_PCT_MIN: 18,
  LABOR_PCT_MAX: 28,
  LABOR_PCT_TOLERANCE_MIN: 1.5,
  LABOR_PCT_TOLERANCE_MAX: 2.0,
  SPLH_MIN: 55,
  SPLH_MAX: 120,
  CPLH_MIN: 2.0,
  CPLH_MAX: 6.0,
};

interface LaborStandards {
  target_labor_pct: number;
  labor_pct_tolerance: number;
  splh_floor: number;
  cplh_target: number;
  cplh_tolerance: number;
  ot_warning_threshold: number;
  ot_critical_threshold: number;
  excluded_roles: string[];
}

interface Props {
  standards: LaborStandards;
  onSave: (updates: Partial<LaborStandards>) => Promise<void>;
  loading: boolean;
}

export function LaborStandardsForm({ standards, onSave, loading }: Props) {
  const [formData, setFormData] = useState<LaborStandards>(standards);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  function handleChange(field: keyof LaborStandards, value: any) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear validation error for this field
    setValidationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    // Labor % validation
    if (formData.target_labor_pct < LABOR_BOUNDS.LABOR_PCT_MIN || formData.target_labor_pct > LABOR_BOUNDS.LABOR_PCT_MAX) {
      errors.target_labor_pct = `Must be between ${LABOR_BOUNDS.LABOR_PCT_MIN}% and ${LABOR_BOUNDS.LABOR_PCT_MAX}% (Layer 1 bound)`;
    }

    if (formData.labor_pct_tolerance < LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MIN || formData.labor_pct_tolerance > LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MAX) {
      errors.labor_pct_tolerance = `Must be between ${LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MIN}% and ${LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MAX}% (Layer 1 bound)`;
    }

    // SPLH validation
    if (formData.splh_floor < LABOR_BOUNDS.SPLH_MIN || formData.splh_floor > LABOR_BOUNDS.SPLH_MAX) {
      errors.splh_floor = `Must be between $${LABOR_BOUNDS.SPLH_MIN} and $${LABOR_BOUNDS.SPLH_MAX} (Layer 1 bound)`;
    }

    // CPLH validation
    if (formData.cplh_target < LABOR_BOUNDS.CPLH_MIN || formData.cplh_target > LABOR_BOUNDS.CPLH_MAX) {
      errors.cplh_target = `Must be between ${LABOR_BOUNDS.CPLH_MIN} and ${LABOR_BOUNDS.CPLH_MAX} (Layer 1 bound)`;
    }

    if (formData.cplh_tolerance <= 0 || formData.cplh_tolerance > 2) {
      errors.cplh_tolerance = 'Must be between 0 and 2';
    }

    // OT threshold validation
    if (formData.ot_warning_threshold >= formData.ot_critical_threshold) {
      errors.ot_warning_threshold = 'Warning must be less than critical';
      errors.ot_critical_threshold = 'Critical must be greater than warning';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) {
      alert('❌ Please fix validation errors before saving');
      return;
    }

    await onSave(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Labor Percentage */}
      <Card>
        <CardHeader>
          <CardTitle>Labor Percentage</CardTitle>
          <CardDescription>
            Target labor cost as % of net sales with tolerance band
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_labor_pct">
                Target Labor %
                <Badge variant="outline" className="ml-2">
                  {LABOR_BOUNDS.LABOR_PCT_MIN}% - {LABOR_BOUNDS.LABOR_PCT_MAX}%
                </Badge>
              </Label>
              <Input
                id="target_labor_pct"
                type="number"
                step="0.1"
                min={LABOR_BOUNDS.LABOR_PCT_MIN}
                max={LABOR_BOUNDS.LABOR_PCT_MAX}
                value={formData.target_labor_pct}
                onChange={(e) => handleChange('target_labor_pct', parseFloat(e.target.value))}
                className={validationErrors.target_labor_pct ? 'border-red-500' : ''}
              />
              {validationErrors.target_labor_pct && (
                <p className="text-sm text-red-500">{validationErrors.target_labor_pct}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="labor_pct_tolerance">
                Tolerance ±%
                <Badge variant="outline" className="ml-2">
                  {LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MIN}% - {LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MAX}%
                </Badge>
              </Label>
              <Input
                id="labor_pct_tolerance"
                type="number"
                step="0.1"
                min={LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MIN}
                max={LABOR_BOUNDS.LABOR_PCT_TOLERANCE_MAX}
                value={formData.labor_pct_tolerance}
                onChange={(e) => handleChange('labor_pct_tolerance', parseFloat(e.target.value))}
                className={validationErrors.labor_pct_tolerance ? 'border-red-500' : ''}
              />
              {validationErrors.labor_pct_tolerance && (
                <p className="text-sm text-red-500">{validationErrors.labor_pct_tolerance}</p>
              )}
            </div>
          </div>

          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              Exception fires when Labor % exceeds target + tolerance. Critical escalation at {'>'}30% (non-waivable).
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* SPLH (Sales Per Labor Hour) */}
      <Card>
        <CardHeader>
          <CardTitle>SPLH - Sales Per Labor Hour</CardTitle>
          <CardDescription>
            Financial productivity metric (revenue generated per hour worked)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="splh_floor">
              SPLH Floor
              <Badge variant="outline" className="ml-2">
                ${LABOR_BOUNDS.SPLH_MIN} - ${LABOR_BOUNDS.SPLH_MAX}
              </Badge>
            </Label>
            <Input
              id="splh_floor"
              type="number"
              step="1"
              min={LABOR_BOUNDS.SPLH_MIN}
              max={LABOR_BOUNDS.SPLH_MAX}
              value={formData.splh_floor}
              onChange={(e) => handleChange('splh_floor', parseFloat(e.target.value))}
              className={validationErrors.splh_floor ? 'border-red-500' : ''}
            />
            {validationErrors.splh_floor && (
              <p className="text-sm text-red-500">{validationErrors.splh_floor}</p>
            )}
          </div>

          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              Exception when SPLH {'<'} floor. Critical when SPLH {'<'} floor × 0.85.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* CPLH (Covers Per Labor Hour) */}
      <Card>
        <CardHeader>
          <CardTitle>CPLH - Covers Per Labor Hour</CardTitle>
          <CardDescription>
            Operational throughput metric (guests served per hour worked)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cplh_target">
                CPLH Target
                <Badge variant="outline" className="ml-2">
                  {LABOR_BOUNDS.CPLH_MIN} - {LABOR_BOUNDS.CPLH_MAX}
                </Badge>
              </Label>
              <Input
                id="cplh_target"
                type="number"
                step="0.1"
                min={LABOR_BOUNDS.CPLH_MIN}
                max={LABOR_BOUNDS.CPLH_MAX}
                value={formData.cplh_target}
                onChange={(e) => handleChange('cplh_target', parseFloat(e.target.value))}
                className={validationErrors.cplh_target ? 'border-red-500' : ''}
              />
              {validationErrors.cplh_target && (
                <p className="text-sm text-red-500">{validationErrors.cplh_target}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cplh_tolerance">Tolerance</Label>
              <Input
                id="cplh_tolerance"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={formData.cplh_tolerance}
                onChange={(e) => handleChange('cplh_tolerance', parseFloat(e.target.value))}
                className={validationErrors.cplh_tolerance ? 'border-red-500' : ''}
              />
              {validationErrors.cplh_tolerance && (
                <p className="text-sm text-red-500">{validationErrors.cplh_tolerance}</p>
              )}
            </div>
          </div>

          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              <strong>Guidance:</strong> Fine dining 2.0-2.8 | Upscale casual 2.5-3.5 | Lounge/club 3.5-5.0
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Overtime Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Overtime Thresholds</CardTitle>
          <CardDescription>
            OT as % of total hours (warning and critical escalation levels)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ot_warning_threshold">Warning Threshold (%)</Label>
              <Input
                id="ot_warning_threshold"
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={formData.ot_warning_threshold}
                onChange={(e) => handleChange('ot_warning_threshold', parseFloat(e.target.value))}
                className={validationErrors.ot_warning_threshold ? 'border-red-500' : ''}
              />
              {validationErrors.ot_warning_threshold && (
                <p className="text-sm text-red-500">{validationErrors.ot_warning_threshold}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ot_critical_threshold">Critical Threshold (%)</Label>
              <Input
                id="ot_critical_threshold"
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={formData.ot_critical_threshold}
                onChange={(e) => handleChange('ot_critical_threshold', parseFloat(e.target.value))}
                className={validationErrors.ot_critical_threshold ? 'border-red-500' : ''}
              />
              {validationErrors.ot_critical_threshold && (
                <p className="text-sm text-red-500">{validationErrors.ot_critical_threshold}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostic Matrix Info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle>Integrated Diagnostic Matrix</CardTitle>
          <CardDescription>How SPLH + CPLH determine root cause</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="font-semibold">SPLH</div>
              <div className="font-semibold">CPLH</div>
              <div className="font-semibold">Diagnostic</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>❌ Below</div>
              <div>❌ Below</div>
              <div className="text-red-600 font-medium">Overstaffed + Slow (Critical)</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>❌ Below</div>
              <div>✅ Okay</div>
              <div className="text-orange-600 font-medium">Overstaffed but Busy</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>✅ Okay</div>
              <div>❌ Below</div>
              <div className="text-yellow-600 font-medium">Understaffed or Pacing Issue</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>✅ Okay</div>
              <div>✅ Okay</div>
              <div className="text-green-600 font-medium">Efficient (No Exception)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={loading} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {loading ? 'Saving...' : 'Save Labor Standards'}
        </Button>
      </div>
    </form>
  );
}
