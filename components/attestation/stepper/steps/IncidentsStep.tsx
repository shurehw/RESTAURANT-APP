'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IncidentLog } from '@/components/attestation/IncidentLog';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertOctagon } from 'lucide-react';
import type {
  NightlyIncident,
  TriggerResult,
  NightlyAttestation,
} from '@/lib/attestation/types';
import { GUIDED_PROMPTS } from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  incidents: NightlyIncident[];
  onAdd: (incident: any) => Promise<void>;
  disabled: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function IncidentsStep({
  triggers,
  incidents,
  onAdd,
  disabled,
  attestation,
  onUpdate,
}: Props) {
  const notesLen = attestation?.incident_notes?.length ?? 0;
  const hasNotes = notesLen >= 10;
  const isAcknowledged = !!attestation?.incidents_acknowledged;

  return (
    <div className="space-y-4">
      {/* Context: trigger reasons */}
      {triggers?.incident_triggers && triggers.incident_triggers.length > 0 && (
        <Card className="bg-muted/30 border-brass/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-brass" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Incident Context
              </span>
            </div>

            <div className="space-y-1">
              {triggers.incident_triggers.map((reason, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                  <span className="text-muted-foreground">{reason}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {onUpdate && (
        <>
          {/* Guided prompt */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{GUIDED_PROMPTS.incidents}</h4>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Describe any guest complaints, safety concerns, staff issues, equipment problems..."
              rows={3}
              maxLength={1000}
              value={attestation?.incident_notes ?? ''}
              onChange={(e) => onUpdate({ incident_notes: e.target.value, incidents_acknowledged: false })}
              onBlur={(e) => onUpdate({ incident_notes: e.target.value })}
              disabled={disabled}
            />
            <div className="flex items-center justify-between">
              {notesLen > 0 && notesLen < 10 && (
                <span className="text-[11px] text-muted-foreground">
                  Minimum 10 characters required
                </span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {notesLen}/1000
              </span>
            </div>
          </div>

          {/* Nothing to report toggle */}
          {!hasNotes && (
            <label className="flex items-center gap-2 px-1 cursor-pointer">
              <Checkbox
                checked={isAcknowledged}
                onCheckedChange={(checked) =>
                  onUpdate({ incidents_acknowledged: !!checked })
                }
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">
                Nothing to report — no incidents tonight
              </span>
            </label>
          )}
        </>
      )}

      <IncidentLog
        triggers={triggers}
        incidents={incidents}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
