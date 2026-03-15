'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, UtensilsCrossed, Wine, Plus, X, Minus } from 'lucide-react';

export interface EightySixedItem {
  name: string;
  qty?: number;
}

interface EightySixSectionProps {
  items: EightySixedItem[];
  onItemsChange: (items: EightySixedItem[]) => void;
  previousNightItems: string[];
  foodNotes: string;
  beverageNotes: string;
  onFoodNotesChange: (v: string) => void;
  onBeverageNotesChange: (v: string) => void;
  readonly?: boolean;
}

export function EightySixSection({
  items,
  onItemsChange,
  previousNightItems,
  foodNotes,
  beverageNotes,
  onFoodNotesChange,
  onBeverageNotesChange,
  readonly,
}: EightySixSectionProps) {
  const [newItem, setNewItem] = useState('');

  function addItem() {
    const name = newItem.trim();
    if (!name) return;
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) return;
    onItemsChange([...items, { name }]);
    setNewItem('');
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function updateQty(index: number, delta: number) {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const current = item.qty ?? 0;
      const next = Math.max(0, current + delta);
      return { ...item, qty: next || undefined };
    });
    onItemsChange(updated);
  }

  function addFromPreviousNight(name: string) {
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) return;
    onItemsChange([...items, { name }]);
  }

  const carryoverSuggestions = readonly
    ? []
    : previousNightItems.filter(
        (pn) => !items.some((i) => i.name.toLowerCase() === pn.toLowerCase()),
      );

  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader className="pb-3 print:pb-1 print:px-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-brass" />
          Menu &amp; 86&apos;d
          {items.length > 0 && (
            <Badge variant="error" className="ml-1">{items.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="print:px-0 space-y-4">
        {/* 86'd Items */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            86&apos;d Items
          </h4>

          {items.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border p-2 bg-error/5 print:bg-transparent print:border-gray-300"
                >
                  <span className="flex-1 text-sm font-medium">{item.name}</span>

                  {item.qty != null && (
                    <span className={`text-xs tabular-nums ${readonly ? '' : 'hidden print:inline'} text-muted-foreground`}>
                      qty: {item.qty}
                    </span>
                  )}

                  {!readonly && (
                    <>
                      <div className="flex items-center gap-1 print:hidden">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateQty(i, -1)}
                          disabled={!item.qty}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-xs w-6 text-center tabular-nums">
                          {item.qty ?? '—'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateQty(i, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-error print:hidden"
                        onClick={() => removeItem(i)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic mb-3">
              No 86&apos;d items
            </p>
          )}

          {/* Add new item — only when editable */}
          {!readonly && (
            <div className="flex items-center gap-2 print:hidden">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                placeholder="Add 86'd item..."
                className="h-8 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={addItem}
                disabled={!newItem.trim()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          )}

          {/* Previous night carryover suggestions */}
          {carryoverSuggestions.length > 0 && (
            <div className="mt-2 print:hidden">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                From last night
              </p>
              <div className="flex flex-wrap gap-1.5">
                {carryoverSuggestions.map((name) => (
                  <button
                    key={name}
                    onClick={() => addFromPreviousNight(name)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-error hover:text-error transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Two-column: Food Notes | Beverage Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              Food Notes
            </h4>
            {readonly ? (
              <div className="text-sm whitespace-pre-wrap">
                {foodNotes || <span className="text-muted-foreground italic">No food notes</span>}
              </div>
            ) : (
              <>
                <Textarea
                  className="min-h-[80px] print:hidden"
                  value={foodNotes}
                  onChange={(e) => onFoodNotesChange(e.target.value)}
                  placeholder="Specials, shortages, menu updates..."
                />
                <div className="hidden print:block text-sm whitespace-pre-wrap">
                  {foodNotes || <span className="text-muted-foreground italic">No food notes</span>}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wine className="h-3.5 w-3.5" />
              Beverage Notes
            </h4>
            {readonly ? (
              <div className="text-sm whitespace-pre-wrap">
                {beverageNotes || <span className="text-muted-foreground italic">No beverage notes</span>}
              </div>
            ) : (
              <>
                <Textarea
                  className="min-h-[80px] print:hidden"
                  value={beverageNotes}
                  onChange={(e) => onBeverageNotesChange(e.target.value)}
                  placeholder="Feature cocktails, wine pours, inventory notes..."
                />
                <div className="hidden print:block text-sm whitespace-pre-wrap">
                  {beverageNotes || <span className="text-muted-foreground italic">No beverage notes</span>}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
