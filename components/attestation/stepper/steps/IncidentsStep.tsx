'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IncidentLog } from '@/components/attestation/IncidentLog';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import { AlertOctagon, Activity } from 'lucide-react';
import type {
  NightlyIncident,
  TriggerResult,
  NightlyAttestation,
  IncidentTag,
} from '@/lib/attestation/types';
import { INCIDENT_TAGS, INCIDENT_TAG_LABELS } from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  incidents: NightlyIncident[];
  onAdd: (incident: any) => Promise<void>;
  disabled: boolean;
  // Context
  healthScore?: number | null;
  healthStatus?: string | null;
  // AI narrative + tags
  narrative?: string | null;
  narrativeLoading?: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function IncidentsStep({
  triggers,
  incidents,
  onAdd,
  disabled,
  healthScore,
  healthStatus,
  narrative,
  narrativeLoading,
  attestation,
  onUpdate,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Context: trigger reasons + health */}
      {(triggers?.incident_triggers?.length || healthScore != null) && (
        <Card className="bg-muted/30 border-brass/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-brass" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Incident Context
              </span>
            </div>

            {triggers?.incident_triggers && triggers.incident_triggers.length > 0 && (
              <div className="space-y-1">
                {triggers.incident_triggers.map((reason, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                    <span className="text-muted-foreground">{reason}</span>
                  </div>
                ))}
              </div>
            )}

            {healthScore != null && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Venue Health Score: <span className="font-medium text-foreground">{healthScore}</span>
                {healthStatus && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    healthStatus === 'GREEN' ? 'bg-sage/20 text-sage' :
                    healthStatus === 'YELLOW' ? 'bg-yellow-500/20 text-yellow-600' :
                    healthStatus === 'ORANGE' ? 'bg-orange-500/20 text-orange-600' :
                    'bg-error/20 text-error'
                  }`}>
                    {healthStatus}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <NarrativeCard
        title="AI Incident Brief"
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
      />

      {onUpdate && (
        <>
          <TagSelector<IncidentTag>
            tags={INCIDENT_TAGS}
            labels={INCIDENT_TAG_LABELS}
            selected={attestation?.incident_tags ?? []}
            onChange={(tags) => onUpdate({ incident_tags: tags })}
            disabled={disabled}
            title="What drove incidents tonight?"
          />

          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Additional incident notes (optional)..."
            rows={2}
            maxLength={500}
            value={attestation?.incident_notes ?? ''}
            onChange={(e) => onUpdate({ incident_notes: e.target.value })}
            onBlur={(e) => onUpdate({ incident_notes: e.target.value })}
            disabled={disabled}
          />
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
