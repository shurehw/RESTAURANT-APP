'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ClipboardCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NightlyReportPayload } from '@/lib/attestation/types';
import { useAttestation } from './useAttestation';
import { RevenueAttestation } from './RevenueAttestation';
import { CompResolutionPanel } from './CompResolutionPanel';
import { LaborAttestation } from './LaborAttestation';
import { IncidentLog } from './IncidentLog';
import { CoachingQueue } from './CoachingQueue';
import { AttestationSubmitBar } from './AttestationSubmitBar';

interface Props {
  venueId: string;
  businessDate: string;
  reportData: NightlyReportPayload;
}

export function AttestationSection({ venueId, businessDate, reportData }: Props) {
  const [expanded, setExpanded] = useState(true);
  const {
    attestation,
    triggers,
    compResolutions,
    incidents,
    coachingActions,
    loading,
    saving,
    submitting,
    error,
    completionState,
    canSubmit,
    isLocked,
    updateField,
    addCompResolution,
    addIncident,
    addCoaching,
    submitAttestation,
  } = useAttestation(venueId, businessDate, reportData);

  const hasRequiredModules =
    triggers?.revenue_attestation_required ||
    triggers?.comp_resolution_required ||
    triggers?.labor_attestation_required ||
    triggers?.incident_log_required;

  return (
    <Card className="border-brass/30 bg-brass/[0.02]">
      <CardHeader
        className="border-b border-brass/20 py-3 cursor-pointer hover:bg-brass/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-brass" />
          Operator Attestation
          {saving && (
            <span className="text-xs text-muted-foreground ml-2">Saving...</span>
          )}
          {isLocked && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-sage text-white rounded ml-2">
              {attestation?.status === 'amended' ? 'Amended' : 'Submitted'}
            </span>
          )}
          {!isLocked && hasRequiredModules && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-brass text-white rounded ml-2">
              Action Required
            </span>
          )}
          <span className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </span>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brass" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading attestation...
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-error/5 border border-error/30 rounded-md p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-error shrink-0" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {/* All 5 modules — always visible */}
          {!loading && attestation && (
            <>
              {/* 1. Revenue */}
              <CollapsibleModule
                label="Revenue"
                required={triggers?.revenue_attestation_required}
                defaultExpanded={triggers?.revenue_attestation_required ?? false}
              >
                <RevenueAttestation
                  triggers={triggers}
                  attestation={attestation}
                  onUpdate={updateField}
                  disabled={isLocked}
                />
              </CollapsibleModule>

              {/* 2. Comp Resolutions */}
              <CollapsibleModule
                label="Comps"
                required={triggers?.comp_resolution_required}
                defaultExpanded={triggers?.comp_resolution_required ?? false}
              >
                <CompResolutionPanel
                  triggers={triggers}
                  resolutions={compResolutions}
                  onAdd={addCompResolution}
                  disabled={isLocked}
                />
              </CollapsibleModule>

              {/* 3. Labor */}
              <CollapsibleModule
                label="Labor"
                required={triggers?.labor_attestation_required}
                defaultExpanded={triggers?.labor_attestation_required ?? false}
              >
                <LaborAttestation
                  triggers={triggers}
                  attestation={attestation}
                  onUpdate={updateField}
                  disabled={isLocked}
                />
              </CollapsibleModule>

              {/* 4. Incidents */}
              <CollapsibleModule
                label="Incidents"
                required={triggers?.incident_log_required}
                defaultExpanded={triggers?.incident_log_required ?? false}
              >
                <IncidentLog
                  triggers={triggers}
                  incidents={incidents}
                  onAdd={addIncident}
                  disabled={isLocked}
                />
              </CollapsibleModule>

              {/* 5. Coaching */}
              <CollapsibleModule
                label="Coaching"
                required={false}
                defaultExpanded={false}
              >
                <CoachingQueue
                  actions={coachingActions}
                  onAdd={addCoaching}
                  disabled={isLocked}
                />
              </CollapsibleModule>

              {/* Submit bar */}
              <AttestationSubmitBar
                triggers={triggers}
                attestation={attestation}
                completionState={completionState}
                canSubmit={canSubmit}
                isLocked={isLocked}
                submitting={submitting}
                onSubmit={submitAttestation}
              />
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Collapsible wrapper — required modules start expanded, optional collapsed
// ---------------------------------------------------------------------------

function CollapsibleModule({
  label,
  required,
  defaultExpanded,
  children,
}: {
  label: string;
  required?: boolean;
  defaultExpanded: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultExpanded);

  return (
    <div>
      {/* Collapsed summary — only shown when collapsed */}
      {!open && (
        <div
          className={`
            flex items-center justify-between px-4 py-2.5 rounded-md cursor-pointer
            transition-colors
            ${required
              ? 'bg-brass/5 border border-brass/30 hover:bg-brass/10'
              : 'bg-muted/30 border border-muted hover:bg-muted/50'
            }
          `}
          onClick={() => setOpen(true)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            {required ? (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-brass text-white rounded">
                Required
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Optional</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Expanded content */}
      {open && (
        <div className="relative">
          {/* Collapse button floated top-right inside the child card */}
          <button
            className="absolute top-3 right-3 z-10 p-1 rounded hover:bg-muted/50 transition-colors"
            onClick={() => setOpen(false)}
            title={`Collapse ${label}`}
          >
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </button>
          {children}
        </div>
      )}
    </div>
  );
}
