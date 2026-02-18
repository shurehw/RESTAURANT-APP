'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IncidentLog } from '@/components/attestation/IncidentLog';
import { AlertOctagon, Activity } from 'lucide-react';
import type { NightlyIncident, TriggerResult } from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  incidents: NightlyIncident[];
  onAdd: (incident: any) => Promise<void>;
  disabled: boolean;
  // Context
  healthScore?: number | null;
  healthStatus?: string | null;
}

export function IncidentsStep({
  triggers,
  incidents,
  onAdd,
  disabled,
  healthScore,
  healthStatus,
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

      <IncidentLog
        triggers={triggers}
        incidents={incidents}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
