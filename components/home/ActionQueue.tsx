'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { OrgOpenCommitment } from '@/lib/database/signal-outcomes';

interface Violation {
  id: string;
  violation_type: string;
  severity: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  business_date: string;
  detected_at: string;
  action_count: number;
  block_count: number;
}

type ActionItem =
  | { kind: 'commitment'; data: OrgOpenCommitment; urgency: number }
  | { kind: 'violation'; data: Violation; urgency: number };

interface ActionQueueProps {
  commitments: OrgOpenCommitment[];
  violations: { critical: Violation[]; warnings: Violation[]; info: Violation[] };
  currentUserId: string;
  currentUserName: string;
}

export function ActionQueue({
  commitments,
  violations,
  currentUserId,
  currentUserName,
}: ActionQueueProps) {
  const [isOpen, setIsOpen] = useState(true);

  const items = useMemo(() => {
    const result: ActionItem[] = [];

    for (const c of commitments) {
      const urgency =
        c.commitment_status === 'due'
          ? 100 + c.days_open
          : c.days_open >= 5
            ? 80 + c.days_open
            : 40 + c.days_open;
      result.push({ kind: 'commitment', data: c, urgency });
    }

    const allViolations = [
      ...violations.critical.map((v) => ({ ...v, _sev: 'critical' as const })),
      ...violations.warnings.map((v) => ({ ...v, _sev: 'warning' as const })),
      ...violations.info.map((v) => ({ ...v, _sev: 'info' as const })),
    ];

    for (const v of allViolations) {
      const urgency = v._sev === 'critical' ? 90 : v._sev === 'warning' ? 60 : 20;
      result.push({ kind: 'violation', data: v, urgency });
    }

    return result.sort((a, b) => b.urgency - a.urgency);
  }, [commitments, violations]);

  const dueCount = commitments.filter((c) => c.commitment_status === 'due').length;
  const openCount = commitments.filter((c) => c.commitment_status === 'open').length;
  const criticalCount = violations.critical.length;
  const warningCount = violations.warnings.length;

  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 text-left"
        >
          <ListChecks className="h-5 w-5 text-brass" />
          <div>
            <h2 className="text-lg font-semibold">Action Queue</h2>
            <p className="text-xs text-muted-foreground">
              Commitments and violations requiring attention
            </p>
          </div>
          {isOpen ? (
            <ChevronUp className="ml-2 h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <div className="flex items-center gap-2">
          {dueCount > 0 && (
            <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
              {dueCount} due
            </span>
          )}
          {openCount > 0 && (
            <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
              {openCount} open
            </span>
          )}
          {(dueCount > 0 || openCount > 0) && (criticalCount > 0 || warningCount > 0) && (
            <div className="h-4 w-px bg-border mx-1" />
          )}
          {criticalCount > 0 && (
            <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-2">
          {items.map((item) =>
            item.kind === 'commitment' ? (
              <CommitmentCard
                key={item.data.id}
                commitment={item.data}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
              />
            ) : (
              <ViolationActionCard key={item.data.id} violation={item.data} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommitmentCard — moved verbatim from SignalIntelligence.tsx
// ---------------------------------------------------------------------------

function CommitmentCard({
  commitment: initialCommitment,
  currentUserId,
  currentUserName,
}: {
  commitment: OrgOpenCommitment;
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [commitment, setCommitment] = useState(initialCommitment);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(initialCommitment.last_follow_up_note || '');
  const [followUpDate, setFollowUpDate] = useState(initialCommitment.follow_up_date || '');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDue = commitment.commitment_status === 'due';
  const text = commitment.commitment_text || commitment.entity_name || 'Unspecified commitment';
  const truncated = text.length > 120;
  const followUpStatus = commitment.follow_up_status || (isDue ? 'due' : 'open');

  async function runAction(
    action: string,
    url: string,
    body: Record<string, any>,
    transform?: (data: any) => Partial<OrgOpenCommitment>,
  ) {
    setBusyAction(action);
    setError(null);

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
      }

      if (payload.data) {
        setCommitment((prev) => ({
          ...prev,
          ...payload.data,
          ...(transform ? transform(payload.data) : {}),
        }));
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className={`rounded-r-md border-l-4 bg-muted/30 px-3 py-2.5 ${isDue ? 'border-l-red-500' : 'border-l-amber-500'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            {truncated && !expanded ? `${text.slice(0, 120)}...` : text}
            {truncated && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="ml-1 text-xs text-brass hover:underline"
              >
                {expanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {commitment.manager_name && <span>{commitment.manager_name}</span>}
            {commitment.manager_name && commitment.venue_name && <span>·</span>}
            <span>{commitment.venue_name}</span>
            <span>·</span>
            <span>{commitment.days_open}d ago</span>
            {commitment.commitment_target_date && (
              <>
                <span>·</span>
                <span>
                  due {formatDistanceToNow(new Date(`${commitment.commitment_target_date}T00:00:00`), { addSuffix: true })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={isDue ? 'error' : 'brass'}>{isDue ? 'due' : 'open'}</Badge>
          <Badge variant="outline">{followUpStatus.replace('_', ' ')}</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3 rounded-md border border-border/60 bg-background/70 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Owner: {commitment.assigned_to_name || 'Unassigned'}</span>
          {commitment.follow_up_date && <span>Follow-up: {commitment.follow_up_date}</span>}
          {commitment.last_followed_up_at && (
            <span>
              Last touch: {formatDistanceToNow(new Date(commitment.last_followed_up_at), { addSuffix: true })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busyAction !== null}
            onClick={() => runAction(
              'assign',
              `/api/attestation/signals/${commitment.id}/assign`,
              {
                assigned_to_user_id: currentUserId,
                assigned_to_name: currentUserName,
                follow_up_date: followUpDate || null,
              },
            )}
          >
            {commitment.assigned_to_user_id === currentUserId ? 'Assigned to you' : 'Assign to me'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busyAction !== null}
            onClick={() => runAction(
              'start',
              `/api/attestation/signals/${commitment.id}/follow-up`,
              {
                follow_up_status: 'in_progress',
                follow_up_date: followUpDate || null,
                last_follow_up_note: note || null,
              },
            )}
          >
            Start
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyAction !== null}
            onClick={() => runAction(
              'escalate',
              `/api/attestation/signals/${commitment.id}/follow-up`,
              {
                follow_up_status: 'escalated',
                follow_up_date: followUpDate || null,
                last_follow_up_note: note || null,
              },
            )}
          >
            Escalate
          </Button>
          <Button
            size="sm"
            variant="brass"
            disabled={busyAction !== null}
            onClick={() => runAction(
              'resolve',
              `/api/attestation/signals/${commitment.id}/resolve`,
              { resolution_note: note || null },
              () => ({
                follow_up_status: 'resolved',
                commitment_status: 'fulfilled',
              }),
            )}
          >
            Resolve
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
          <Input
            type="date"
            value={followUpDate}
            onChange={(event) => setFollowUpDate(event.target.value)}
            disabled={busyAction !== null}
          />
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add follow-up note or resolution context"
            className="min-h-[44px]"
            disabled={busyAction !== null}
          />
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={busyAction !== null}
            onClick={() => runAction(
              'save',
              `/api/attestation/signals/${commitment.id}/follow-up`,
              {
                follow_up_status: followUpStatus,
                follow_up_date: followUpDate || null,
                last_follow_up_note: note || null,
              },
            )}
          >
            Save Follow-Up
          </Button>
        </div>

        {commitment.last_follow_up_note && (
          <div className="text-xs text-muted-foreground">
            Latest note: {commitment.last_follow_up_note}
          </div>
        )}

        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViolationActionCard — violations styled consistently with commitments
// ---------------------------------------------------------------------------

function ViolationActionCard({ violation }: { violation: Violation }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor =
    violation.severity === 'critical'
      ? 'border-l-red-500'
      : violation.severity === 'warning'
        ? 'border-l-yellow-500'
        : 'border-l-blue-500';

  return (
    <div className={`rounded-r-md border-l-4 bg-muted/30 px-3 py-2.5 ${borderColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${
              violation.severity === 'critical' ? 'text-red-600'
              : violation.severity === 'warning' ? 'text-yellow-600'
              : 'text-blue-600'
            }`} />
            {violation.title}
          </div>
          {violation.description && (
            <div className="mt-0.5 text-sm text-muted-foreground">
              {expanded ? violation.description : violation.description.slice(0, 120)}
              {violation.description.length > 120 && !expanded && '...'}
              {violation.description.length > 120 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="ml-1 text-xs text-brass hover:underline"
                >
                  {expanded ? 'Less' : 'More'}
                </button>
              )}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {violation.venue_name && <span>{violation.venue_name}</span>}
            {violation.venue_name && <span>·</span>}
            <span className="capitalize">{violation.violation_type.replace(/_/g, ' ')}</span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(violation.detected_at), { addSuffix: true })}</span>
            {violation.action_count > 0 && (
              <>
                <span>·</span>
                <span>{violation.action_count} action{violation.action_count !== 1 ? 's' : ''}</span>
              </>
            )}
            {violation.block_count > 0 && (
              <>
                <span>·</span>
                <span>{violation.block_count} block{violation.block_count !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
        <Badge
          variant={
            violation.severity === 'critical'
              ? 'error'
              : violation.severity === 'warning'
                ? 'brass'
                : 'outline'
          }
        >
          {violation.severity}
        </Badge>
      </div>
    </div>
  );
}
