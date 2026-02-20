'use client';

import { useCallback } from 'react';
import { Crown, Users, Star, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { NightlyAttestation, GuestPromptKey } from '@/lib/attestation/types';
import {
  GUEST_PROMPT_KEYS,
  GUEST_PROMPT_QUESTIONS,
  GUEST_PROMPT_PLACEHOLDERS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

interface NotableGuest {
  check_id: string;
  server: string;
  covers: number;
  payment: number;
  table_name: string;
  cardholder_name: string | null;
  tip_percent: number | null;
  items: string[];
  additional_items?: number;
}

interface KnownVip {
  first_name: string;
  last_name: string;
  is_vip: boolean;
  tags: string[] | null;
  party_size: number;
  total_payment: number;
  status: string;
}

interface Props {
  notableGuests: NotableGuest[];
  peopleWeKnow: KnownVip[];
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
}: {
  promptKey: GuestPromptKey;
  value: string;
  disabled: boolean;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < STRUCTURED_PROMPT_MIN_LENGTH;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate?.({ [promptKey]: e.target.value, guest_acknowledged: false });
    },
    [promptKey, onUpdate],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onUpdate?.({ [promptKey]: e.target.value });
    },
    [promptKey, onUpdate],
  );

  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">{GUEST_PROMPT_QUESTIONS[promptKey]}</h4>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        placeholder={GUEST_PROMPT_PLACEHOLDERS[promptKey]}
        rows={2}
        maxLength={500}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        {belowMin && (
          <span className="text-[11px] text-muted-foreground">
            {STRUCTURED_PROMPT_MIN_LENGTH - len} more characters needed
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {len}/500
        </span>
      </div>
    </div>
  );
}

export function GuestStep({
  notableGuests,
  peopleWeKnow,
  attestation,
  onUpdate,
  disabled,
}: Props) {
  const allPromptsFilled = GUEST_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const isAcknowledged = !!attestation?.guest_acknowledged;

  return (
    <div className="space-y-4">
      {/* Top Spenders — auto-surfaced from TipSee */}
      {notableGuests.length > 0 && (
        <Card className="bg-muted/30 border-brass/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-brass" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brass">
                Top Spenders
              </span>
            </div>
            <div className="space-y-3">
              {notableGuests.map((guest, i) => (
                <div
                  key={guest.check_id}
                  className="flex items-start justify-between gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        #{i + 1}
                      </span>
                      <span className="font-semibold text-lg">
                        {fmt(guest.payment)}
                      </span>
                      {guest.cardholder_name && (
                        <span className="text-sm text-muted-foreground truncate">
                          — {guest.cardholder_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>Server: {guest.server}</span>
                      <span>{guest.covers} cover{guest.covers !== 1 ? 's' : ''}</span>
                      {guest.table_name && <span>Table {guest.table_name}</span>}
                      {guest.tip_percent != null && (
                        <span>{guest.tip_percent.toFixed(0)}% tip</span>
                      )}
                    </div>
                    {guest.items.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {guest.items.join(', ')}
                        {(guest.additional_items ?? 0) > 0 && (
                          <span> +{guest.additional_items} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Known VIPs — from reservation system */}
      {peopleWeKnow.length > 0 && (
        <Card className="bg-muted/30 border-brass/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-brass" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brass">
                Recognized Guests
              </span>
            </div>
            <div className="space-y-2">
              {peopleWeKnow.map((vip, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {vip.is_vip && (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    <span className="text-sm font-medium">
                      {vip.first_name} {vip.last_name}
                    </span>
                    {vip.tags && vip.tags.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({vip.tags.join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{vip.party_size} guest{vip.party_size !== 1 ? 's' : ''}</span>
                    {vip.total_payment > 0 && <span>{fmt(vip.total_payment)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {notableGuests.length === 0 && peopleWeKnow.length === 0 && (
        <Card className="bg-muted/30 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-sm">No top spender or VIP data available for this date.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manager inputs — 3 structured guest prompts */}
      {onUpdate && (
        <>
          {GUEST_PROMPT_KEYS.map((key) => (
            <PromptField
              key={key}
              promptKey={key}
              value={(attestation?.[key] as string) ?? ''}
              disabled={disabled}
              onUpdate={onUpdate}
            />
          ))}

          {/* Nothing to report toggle */}
          {!allPromptsFilled && (
            <label className="flex items-center gap-2 px-1 cursor-pointer">
              <Checkbox
                checked={isAcknowledged}
                onCheckedChange={(checked) =>
                  onUpdate({ guest_acknowledged: !!checked })
                }
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">
                Nothing to report — no notable guests
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
