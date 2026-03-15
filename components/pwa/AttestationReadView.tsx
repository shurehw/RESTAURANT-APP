'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  ShieldAlert,
  UserCheck,
  ChefHat,
  AlertOctagon,
  Users,
  Crown,
  Sparkles,
  Lock,
  Loader2,
  Brain,
  Music,
  UtensilsCrossed as CulinaryIcon,
} from 'lucide-react';
import type {
  NightlyAttestation,
  CompResolution,
  NightlyIncident,
  CoachingAction,
} from '@/lib/attestation/types';
import {
  GUIDED_PROMPTS,
  REVENUE_PROMPT_KEYS,
  COMP_PROMPT_QUESTIONS,
  COMP_PROMPT_KEYS,
  FOH_PROMPT_QUESTIONS,
  FOH_PROMPT_KEYS,
  BOH_PROMPT_QUESTIONS,
  BOH_PROMPT_KEYS,
  COACHING_PROMPT_QUESTIONS,
  COACHING_PROMPT_KEYS,
  GUEST_PROMPT_QUESTIONS,
  GUEST_PROMPT_KEYS,
  REVENUE_TAG_LABELS,
  COMP_TAG_LABELS,
  LABOR_TAG_LABELS,
  INCIDENT_TAG_LABELS,
  COACHING_TAG_LABELS,
  GUEST_TAG_LABELS,
  ENTERTAINMENT_TAG_LABELS,
  CULINARY_TAG_LABELS,
  COMP_RESOLUTION_LABELS,
  INCIDENT_TYPE_LABELS,
  COACHING_TYPE_LABELS,
} from '@/lib/attestation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  attestation: NightlyAttestation;
  compResolutions: CompResolution[];
  incidents: NightlyIncident[];
  coachingActions: CoachingAction[];
  venueName: string;
  date: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;

function QABlock({ question, answer }: { question: string; answer?: string | null }) {
  if (!answer || answer.trim().length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{question}</div>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</div>
    </div>
  );
}

function TagBadges({ tags, labelMap }: { tags?: string[] | null; labelMap: Record<string, string> }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="default" className="text-[11px]">
          {labelMap[tag] ?? tag}
        </Badge>
      ))}
    </div>
  );
}

function NothingToReport() {
  return (
    <div className="text-xs text-muted-foreground italic">Nothing to report</div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-brass" />
      <h3 className="text-sm font-semibold uppercase tracking-wider">{label}</h3>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttestationReadView({
  attestation,
  compResolutions,
  incidents,
  coachingActions,
  venueName,
  date,
}: Props) {
  const revenueHasContent = REVENUE_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  ) || !!attestation.revenue_notes;
  const compHasContent = COMP_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  ) || !!attestation.comp_notes;
  const fohHasContent = FOH_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  ) || !!attestation.labor_notes || !!attestation.labor_foh_notes;
  const bohHasContent = BOH_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  ) || !!attestation.labor_boh_notes;
  const coachingHasContent = COACHING_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  ) || !!attestation.coaching_notes;
  const guestHasContent = GUEST_PROMPT_KEYS.some(
    (k) => ((attestation[k] as string)?.length ?? 0) > 0,
  ) || !!attestation.guest_notes;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Nightly Attestation</h2>
        <div className="text-sm text-muted-foreground">
          {venueName} &mdash;{' '}
          {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={attestation.status === 'amended' ? 'outline' : 'default'} className="text-xs">
            {attestation.status === 'amended' ? 'Amended' : 'Submitted'}
          </Badge>
          {attestation.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(attestation.submitted_at).toLocaleString()}
            </span>
          )}
        </div>
        {attestation.amendment_reason && (
          <div className="text-xs text-muted-foreground mt-1">
            Amendment: {attestation.amendment_reason}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Revenue */}
      <section className="space-y-3">
        <SectionHeader icon={DollarSign} label="Revenue" />
        {revenueHasContent ? (
          <div className="space-y-3">
            {REVENUE_PROMPT_KEYS.map((key) => (
              <QABlock key={key} question={GUIDED_PROMPTS[key]} answer={attestation[key] as string} />
            ))}
          </div>
        ) : (
          <NothingToReport />
        )}
        {attestation.revenue_notes && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.revenue_notes}</div>
        )}
        <TagBadges tags={attestation.revenue_tags} labelMap={REVENUE_TAG_LABELS} />
      </section>

      <div className="border-t border-border" />

      {/* Comps */}
      <section className="space-y-3">
        <SectionHeader icon={ShieldAlert} label="Comps" />
        {compHasContent ? (
          <div className="space-y-3">
            {COMP_PROMPT_KEYS.map((key) => (
              <QABlock key={key} question={COMP_PROMPT_QUESTIONS[key]} answer={attestation[key] as string} />
            ))}
          </div>
        ) : (
          <NothingToReport />
        )}
        {attestation.comp_notes && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.comp_notes}</div>
        )}
        <TagBadges tags={attestation.comp_tags} labelMap={COMP_TAG_LABELS} />

        {compResolutions.length > 0 && (
          <div className="space-y-2 mt-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Comp Resolutions ({compResolutions.length})
            </div>
            <div className="space-y-2">
              {compResolutions.map((r) => (
                <div key={r.id} className="rounded-md border border-border/50 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="default" className="text-[11px]">
                      {COMP_RESOLUTION_LABELS[r.resolution_code] ?? r.resolution_code}
                    </Badge>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.comp_amount != null && <span className="font-medium">{fmt(r.comp_amount)} comp</span>}
                      {r.check_amount != null && <span>on {fmt(r.check_amount)} check</span>}
                    </div>
                  </div>
                  {r.employee_name && (
                    <div className="text-xs text-muted-foreground">Server: {r.employee_name}</div>
                  )}
                  {r.resolution_notes && <div className="text-sm">{r.resolution_notes}</div>}
                  {r.requires_follow_up && (
                    <Badge variant="outline" className="text-[10px] text-brass border-brass/40">
                      Follow-up required
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      {/* FOH */}
      <section className="space-y-3">
        <SectionHeader icon={UserCheck} label="Front of House" />
        {fohHasContent ? (
          <div className="space-y-3">
            {FOH_PROMPT_KEYS.map((key) => (
              <QABlock key={key} question={FOH_PROMPT_QUESTIONS[key]} answer={attestation[key] as string} />
            ))}
          </div>
        ) : (
          <NothingToReport />
        )}
        {attestation.labor_foh_notes && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.labor_foh_notes}</div>
        )}
        {attestation.labor_notes && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Labor Notes</div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.labor_notes}</div>
          </div>
        )}
        <TagBadges tags={attestation.labor_tags} labelMap={LABOR_TAG_LABELS} />
      </section>

      <div className="border-t border-border" />

      {/* BOH */}
      <section className="space-y-3">
        <SectionHeader icon={ChefHat} label="Back of House" />
        {bohHasContent ? (
          <div className="space-y-3">
            {BOH_PROMPT_KEYS.map((key) => (
              <QABlock key={key} question={BOH_PROMPT_QUESTIONS[key]} answer={attestation[key] as string} />
            ))}
          </div>
        ) : (
          <NothingToReport />
        )}
        {attestation.labor_boh_notes && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.labor_boh_notes}</div>
        )}
      </section>

      <div className="border-t border-border" />

      {/* Incidents */}
      <section className="space-y-3">
        <SectionHeader icon={AlertOctagon} label="Incidents" />
        {attestation.incident_notes ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.incident_notes}</div>
        ) : (
          <NothingToReport />
        )}
        <TagBadges tags={attestation.incident_tags} labelMap={INCIDENT_TAG_LABELS} />

        {incidents.length > 0 && (
          <div className="space-y-2 mt-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Incident Log ({incidents.length})
            </div>
            <div className="space-y-2">
              {incidents.map((inc) => (
                <div key={inc.id} className="rounded-md border border-border/50 p-3 text-sm space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-[11px]">
                      {INCIDENT_TYPE_LABELS[inc.incident_type] ?? inc.incident_type}
                    </Badge>
                    <Badge className={`text-[11px] ${SEVERITY_COLORS[inc.severity] ?? ''}`}>
                      {inc.severity}
                    </Badge>
                  </div>
                  <div className="text-sm">{inc.description}</div>
                  {inc.resolution && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Resolution:</span> {inc.resolution}
                    </div>
                  )}
                  {inc.staff_involved.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Staff: {inc.staff_involved.join(', ')}
                    </div>
                  )}
                  {inc.follow_up_required && (
                    <Badge variant="outline" className="text-[10px] text-brass border-brass/40">
                      Follow-up required
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      {/* Coaching */}
      <section className="space-y-3">
        <SectionHeader icon={Users} label="Coaching" />
        {coachingHasContent ? (
          <div className="space-y-3">
            {COACHING_PROMPT_KEYS.map((key) => (
              <QABlock key={key} question={COACHING_PROMPT_QUESTIONS[key]} answer={attestation[key] as string} />
            ))}
          </div>
        ) : (
          <NothingToReport />
        )}
        {attestation.coaching_notes && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.coaching_notes}</div>
        )}
        <TagBadges tags={attestation.coaching_tags} labelMap={COACHING_TAG_LABELS} />

        {coachingActions.length > 0 && (
          <div className="space-y-2 mt-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Coaching Actions ({coachingActions.length})
            </div>
            <div className="space-y-2">
              {coachingActions.map((ca) => (
                <div key={ca.id} className="rounded-md border border-border/50 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ca.employee_name}</span>
                      <Badge variant="default" className="text-[11px]">
                        {COACHING_TYPE_LABELS[ca.coaching_type] ?? ca.coaching_type}
                      </Badge>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        ca.status === 'completed'
                          ? 'text-sage border-sage/40'
                          : ca.status === 'escalated'
                            ? 'text-red-600 border-red-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {ca.status}
                    </Badge>
                  </div>
                  <div className="text-sm">{ca.reason}</div>
                  {ca.action_taken && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Action:</span> {ca.action_taken}
                    </div>
                  )}
                  {ca.follow_up_date && (
                    <div className="text-xs text-muted-foreground">
                      Follow-up:{' '}
                      {new Date(ca.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      {/* Guest */}
      <section className="space-y-3">
        <SectionHeader icon={Crown} label="Guest" />
        {guestHasContent ? (
          <div className="space-y-3">
            {GUEST_PROMPT_KEYS.map((key) => (
              <QABlock key={key} question={GUEST_PROMPT_QUESTIONS[key]} answer={attestation[key] as string} />
            ))}
          </div>
        ) : (
          <NothingToReport />
        )}
        {attestation.guest_notes && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.guest_notes}</div>
        )}
        <TagBadges tags={attestation.guest_tags} labelMap={GUEST_TAG_LABELS} />
      </section>

      {/* Entertainment */}
      {(attestation.entertainment_notes || (attestation.entertainment_tags?.length ?? 0) > 0) && (
        <>
          <div className="border-t border-border" />
          <section className="space-y-3">
            <SectionHeader icon={Music} label="Entertainment" />
            {attestation.entertainment_notes ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.entertainment_notes}</div>
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.entertainment_tags} labelMap={ENTERTAINMENT_TAG_LABELS} />
          </section>
        </>
      )}

      {/* Culinary */}
      {(attestation.culinary_notes || (attestation.culinary_tags?.length ?? 0) > 0) && (
        <>
          <div className="border-t border-border" />
          <section className="space-y-3">
            <SectionHeader icon={CulinaryIcon} label="Culinary" />
            {attestation.culinary_notes ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{attestation.culinary_notes}</div>
            ) : (
              <NothingToReport />
            )}
            <TagBadges tags={attestation.culinary_tags} labelMap={CULINARY_TAG_LABELS} />
          </section>
        </>
      )}

      {/* Closing Narrative */}
      {attestation.closing_narrative && (
        <>
          <div className="border-t border-border" />
          <section className="space-y-3">
            <SectionHeader icon={Sparkles} label="Closing Summary" />
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {attestation.closing_narrative}
            </p>
          </section>
        </>
      )}

      {/* Locked footer */}
      <div className="border-t border-border" />
      <div className="border border-sage/40 rounded-md p-3 bg-sage/5">
        <div className="flex items-center gap-3">
          <Lock className="h-4 w-4 text-sage shrink-0" />
          <div className="text-xs text-muted-foreground">
            {attestation.status === 'amended' ? 'Amended' : 'Submitted'}
            {attestation.submitted_at && (
              <span> &mdash; {new Date(attestation.submitted_at).toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
