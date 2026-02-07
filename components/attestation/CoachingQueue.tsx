'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Plus,
  Star,
  AlertTriangle,
} from 'lucide-react';
import type { CoachingAction } from '@/lib/attestation/types';
import {
  COACHING_TYPES,
  COACHING_TYPE_LABELS,
  type CoachingType,
} from '@/lib/attestation/types';

interface Props {
  actions: CoachingAction[];
  onAdd: (action: any) => Promise<void>;
  disabled: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  recognition: 'bg-sage/20 text-sage',
  correction: 'bg-error/20 text-error',
  training: 'bg-brass/20 text-brass',
  follow_up: 'bg-muted text-muted-foreground',
};

export function CoachingQueue({ actions, onAdd, disabled }: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <Card className="border-muted">
      <CardHeader className="border-b border-brass/20 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-brass" />
          Coaching Queue
          <span className="text-xs text-muted-foreground ml-1">Optional</span>
          {actions.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {actions.length} item{actions.length !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {/* Existing actions */}
        {actions.length > 0 && (
          <div className="space-y-2">
            {actions.map((action) => (
              <CoachingRow key={action.id} action={action} />
            ))}
          </div>
        )}

        {/* Add form */}
        {showForm ? (
          <CoachingForm
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
            Add Coaching Action
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Coaching row
// ---------------------------------------------------------------------------

function CoachingRow({ action }: { action: CoachingAction }) {
  const icon =
    action.coaching_type === 'recognition' ? (
      <Star className="h-3.5 w-3.5" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5" />
    );

  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center gap-2">
        <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded ${TYPE_COLORS[action.coaching_type]}`}>
          {icon}
          {COACHING_TYPE_LABELS[action.coaching_type as CoachingType]}
        </span>
        <span className="text-sm font-medium">{action.employee_name}</span>
        {action.follow_up_date && (
          <span className="text-xs text-muted-foreground ml-auto">
            Follow-up: {action.follow_up_date}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
      {action.action_taken && (
        <p className="text-xs text-sage mt-0.5">Action: {action.action_taken}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coaching add form
// ---------------------------------------------------------------------------

function CoachingForm({
  onAdd,
  onCancel,
  disabled,
}: {
  onAdd: (action: any) => Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [employeeName, setEmployeeName] = useState('');
  const [coachingType, setCoachingType] = useState<CoachingType | ''>('');
  const [reason, setReason] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = employeeName.trim() && coachingType && reason.length >= 5;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onAdd({
      employee_name: employeeName.trim(),
      coaching_type: coachingType,
      reason,
      action_taken: actionTaken || undefined,
      follow_up_date: followUpDate || undefined,
      status: 'pending',
    });
    setSaving(false);
    onCancel();
  };

  return (
    <div className="border border-brass/30 rounded-md p-4 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Employee name *</label>
          <Input
            placeholder="Employee name"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            disabled={disabled}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Type *</label>
          <Select
            value={coachingType}
            onValueChange={(v) => setCoachingType(v as CoachingType)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {COACHING_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {COACHING_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Reason * (min 5 chars)</label>
        <Textarea
          placeholder="Why is this coaching action needed?"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Action taken</label>
          <Textarea
            placeholder="What was done?"
            rows={2}
            maxLength={500}
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            disabled={disabled}
            className="min-h-[32px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Follow-up date</label>
          <Input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            disabled={disabled}
            className="h-8 text-sm"
          />
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
          {saving ? 'Saving...' : 'Add'}
        </Button>
      </div>
    </div>
  );
}
