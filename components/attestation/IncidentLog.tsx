'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { NightlyIncident, TriggerResult } from '@/lib/attestation/types';
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LEVELS,
  type IncidentType,
  type Severity,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  incidents: NightlyIncident[];
  onAdd: (incident: any) => Promise<void>;
  disabled: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-brass/20 text-brass',
  high: 'bg-error/20 text-error',
  critical: 'bg-error text-white',
};

export function IncidentLog({ triggers, incidents, onAdd, disabled }: Props) {
  const isRequired = triggers?.incident_log_required ?? false;
  const isComplete = !isRequired || incidents.length > 0;
  const [showForm, setShowForm] = useState(false);

  return (
    <Card className={isRequired ? 'border-brass/40' : 'border-muted'}>
      <CardHeader className="border-b border-brass/20 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-brass" />
          Incident Log
          {isRequired && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-brass text-white rounded ml-2">
              Required
            </span>
          )}
          {incidents.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
            </span>
          )}
          {isComplete && incidents.length > 0 && (
            <CheckCircle2 className="h-4 w-4 text-sage ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {/* Trigger reasons */}
        {triggers?.incident_triggers && triggers.incident_triggers.length > 0 && (
          <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
              <AlertTriangle className="h-3.5 w-3.5" />
              Trigger reasons
            </div>
            {triggers.incident_triggers.map((reason, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-5">
                {reason}
              </p>
            ))}
          </div>
        )}

        {/* Existing incidents */}
        {incidents.length > 0 && (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <IncidentRow key={inc.id} incident={inc} />
            ))}
          </div>
        )}

        {/* Add form */}
        {showForm ? (
          <IncidentForm
            onAdd={onAdd}
            onCancel={() => setShowForm(false)}
            disabled={disabled}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Incident
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Incident row (collapsed view)
// ---------------------------------------------------------------------------

function IncidentRow({ incident }: { incident: NightlyIncident }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border rounded-md p-3 cursor-pointer hover:bg-muted/30"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 text-xs font-semibold rounded ${SEVERITY_COLORS[incident.severity]}`}>
          {incident.severity}
        </span>
        <span className="text-sm font-medium">
          {INCIDENT_TYPE_LABELS[incident.incident_type as IncidentType]}
        </span>
        {incident.resolved && (
          <CheckCircle2 className="h-3.5 w-3.5 text-sage ml-auto" />
        )}
        {!incident.resolved && incident.follow_up_required && (
          <span className="px-2 py-0.5 text-xs bg-error/10 text-error rounded ml-auto">
            Follow-up needed
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      {expanded && (
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          <p>{incident.description}</p>
          {incident.resolution && <p className="text-sage">Resolution: {incident.resolution}</p>}
          {incident.staff_involved?.length > 0 && (
            <p>Staff: {incident.staff_involved.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incident add form
// ---------------------------------------------------------------------------

function IncidentForm({
  onAdd,
  onCancel,
  disabled,
}: {
  onAdd: (inc: any) => Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [type, setType] = useState<IncidentType | ''>('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [description, setDescription] = useState('');
  const [resolution, setResolution] = useState('');
  const [staffInvolved, setStaffInvolved] = useState('');
  const [resolved, setResolved] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = type && description.length >= 10;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onAdd({
      incident_type: type,
      severity,
      description,
      resolution: resolution || undefined,
      resolved,
      staff_involved: staffInvolved
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      follow_up_required: followUp,
    });
    setSaving(false);
    onCancel();
  };

  return (
    <div className="border border-brass/30 rounded-md p-4 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Incident type *</label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as IncidentType)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {INCIDENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {INCIDENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Severity</label>
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as Severity)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Description * (min 10 chars)</label>
        <Textarea
          placeholder="Describe what happened..."
          rows={3}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Resolution</label>
        <Textarea
          placeholder="How was this resolved? (leave blank if unresolved)"
          rows={2}
          maxLength={1000}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Staff involved (comma-separated)</label>
        <Input
          placeholder="John D, Sarah M"
          value={staffInvolved}
          onChange={(e) => setStaffInvolved(e.target.value)}
          disabled={disabled}
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="incident-resolved"
            checked={resolved}
            onCheckedChange={(c) => setResolved(c === true)}
            disabled={disabled}
          />
          <label htmlFor="incident-resolved" className="text-xs cursor-pointer">
            Resolved
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="incident-follow-up"
            checked={followUp}
            onCheckedChange={(c) => setFollowUp(c === true)}
            disabled={disabled}
          />
          <label htmlFor="incident-follow-up" className="text-xs cursor-pointer">
            Follow-up required
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="brass"
          size="sm"
          onClick={handleSave}
          disabled={disabled || !canSave || saving}
        >
          {saving ? 'Saving...' : 'Add Incident'}
        </Button>
      </div>
    </div>
  );
}
