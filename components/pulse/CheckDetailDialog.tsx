'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Users,
  UtensilsCrossed,
  Wine,
  CreditCard,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface CheckItemDetail {
  name: string;
  category: string;
  parent_category: string;
  quantity: number;
  price: number;
  comp_total: number;
  void_value: number;
  is_beverage: boolean;
}

interface CheckPaymentDetail {
  cc_name: string | null;
  amount: number;
  tip_amount: number;
}

interface CheckDetail {
  id: string;
  table_name: string;
  employee_name: string;
  employee_role_name: string;
  guest_count: number;
  sub_total: number;
  revenue_total: number;
  comp_total: number;
  void_total: number;
  open_time: string;
  close_time: string | null;
  voidcomp_reason_text: string;
  items: CheckItemDetail[];
  payments: CheckPaymentDetail[];
}

interface CheckDetailDialogProps {
  checkId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

export function CheckDetailDialog({ checkId, isOpen, onClose }: CheckDetailDialogProps) {
  const [detail, setDetail] = useState<CheckDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Map<string, CheckDetail>>(new Map());

  useEffect(() => {
    if (!isOpen || !checkId) return;

    const cached = cache.current.get(checkId);
    if (cached) {
      setDetail(cached);
      return;
    }

    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(`/api/sales/checks?check_id=${checkId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          cache.current.set(checkId, data);
          setDetail(data);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, checkId]);

  // Group items by food vs beverage
  const foodItems = detail?.items.filter(i => !i.is_beverage) || [];
  const bevItems = detail?.items.filter(i => i.is_beverage) || [];

  const totalPayments = detail?.payments.reduce((s, p) => s + p.amount, 0) || 0;
  const totalTips = detail?.payments.reduce((s, p) => s + p.tip_amount, 0) || 0;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-sm text-red-500 py-12 text-center px-4">{error}</div>
        )}

        {detail && !loading && (
          <>
            {/* Header */}
            <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base">
                  {detail.table_name}
                </DialogTitle>
                {!detail.close_time && (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-500 text-xs">
                    Open
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span>{detail.employee_name}</span>
                {detail.employee_role_name && (
                  <span className="text-muted-foreground/60">{detail.employee_role_name}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtTime(detail.open_time)}
                  {detail.close_time && ` – ${fmtTime(detail.close_time)}`}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {detail.guest_count} {detail.guest_count === 1 ? 'guest' : 'guests'}
                </span>
              </div>
            </DialogHeader>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-3 px-4 py-3 border-b border-border">
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Subtotal</div>
                <div className="text-sm font-semibold">{fmt(detail.sub_total)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Net Revenue</div>
                <div className="text-sm font-semibold">{fmt(detail.revenue_total)}</div>
              </div>
              {detail.comp_total > 0 && (
                <div>
                  <div className="text-[11px] text-red-400 uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Comps
                  </div>
                  <div className="text-sm font-semibold text-red-400">{fmt(detail.comp_total)}</div>
                  {detail.voidcomp_reason_text && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {detail.voidcomp_reason_text}
                    </div>
                  )}
                </div>
              )}
              {detail.void_total > 0 && (
                <div>
                  <div className="text-[11px] text-orange-400 uppercase tracking-wide">Voids</div>
                  <div className="text-sm font-semibold text-orange-400">{fmt(detail.void_total)}</div>
                </div>
              )}
            </div>

            {/* Items */}
            {detail.items.length > 0 && (
              <div className="px-4 py-3 border-b border-border">
                {/* Food items */}
                {foodItems.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                      <UtensilsCrossed className="h-3 w-3" />
                      Food ({foodItems.length})
                    </div>
                    {foodItems.map((item, i) => (
                      <ItemRow key={`f-${i}`} item={item} />
                    ))}
                  </div>
                )}

                {/* Beverage items */}
                {bevItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                      <Wine className="h-3 w-3" />
                      Beverage ({bevItems.length})
                    </div>
                    {bevItems.map((item, i) => (
                      <ItemRow key={`b-${i}`} item={item} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Payments */}
            {detail.payments.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <CreditCard className="h-3 w-3" />
                  Payments ({detail.payments.length})
                </div>
                {detail.payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-sm border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground truncate max-w-[50%]">
                      {p.cc_name || 'Card'}
                    </span>
                    <div className="flex items-center gap-3 text-right">
                      <span className="font-medium tabular-nums">{fmt(p.amount)}</span>
                      {p.tip_amount > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          tip {fmt(p.tip_amount)}
                          {p.amount > 0 && (
                            <span className="ml-1">
                              ({((p.tip_amount / p.amount) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Payment totals */}
                {detail.payments.length > 1 && (
                  <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t border-border mt-1">
                    <span>Total</span>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{fmt(totalPayments)}</span>
                      {totalTips > 0 && <span>tip {fmt(totalTips)}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ item }: { item: CheckItemDetail }) {
  const lineTotal = item.price * item.quantity;
  const isComped = item.comp_total > 0;
  const isVoided = item.void_value > 0;

  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className={`truncate ${isComped ? 'line-through text-muted-foreground' : ''}`}>
          {item.quantity > 1 && <span className="text-muted-foreground">{item.quantity}x </span>}
          {item.name}
        </span>
        {isComped && (
          <Badge variant="error" className="text-[10px] px-1 py-0 shrink-0">
            Comp
          </Badge>
        )}
        {isVoided && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-400 text-orange-400 shrink-0">
            Void
          </Badge>
        )}
      </div>
      <span className={`tabular-nums ml-2 shrink-0 ${isComped ? 'line-through text-muted-foreground' : 'font-medium'}`}>
        {fmt(lineTotal)}
      </span>
    </div>
  );
}
