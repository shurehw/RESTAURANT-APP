'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, Sparkles, TrendingUp } from 'lucide-react';

interface GLAccount {
  id: string;
  external_code: string;
  name: string;
  section: string;
  confidence?: string;
  reason?: string;
}

interface GLAccountSelectorProps {
  itemId: string;
  itemName: string;
  itemCategory: string;
  currentGLAccountId?: string;
  organizationId: string;
  vendorId?: string;
  invoiceId?: string;
  onSelect: (glAccountId: string) => Promise<void>;
  compact?: boolean;
}

export function GLAccountSelector({
  itemId,
  itemName,
  itemCategory,
  currentGLAccountId,
  organizationId,
  vendorId,
  invoiceId,
  onSelect,
  compact = false,
}: GLAccountSelectorProps) {
  const [suggestions, setSuggestions] = useState<GLAccount[]>([]);
  const [allAccounts, setAllAccounts] = useState<GLAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(currentGLAccountId);
  const [showAll, setShowAll] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadSuggestions();
  }, [itemId]);

  const loadSuggestions = async () => {
    setIsLoading(true);
    try {
      // Load ML-enhanced suggestions
      const { data: suggestedAccounts, error: suggestError } = await supabase
        .rpc('suggest_gl_account_for_item_v2', {
          p_item_id: itemId,
          p_organization_id: organizationId,
          p_vendor_id: vendorId || null,
        });

      if (!suggestError && suggestedAccounts) {
        setSuggestions(suggestedAccounts);
      }

      // Load all accounts for fallback
      const { data: accounts } = await supabase
        .from('gl_accounts')
        .select('id, external_code, name, section')
        .eq('org_id', organizationId)
        .eq('is_active', true)
        .eq('is_summary', false)
        .order('section')
        .order('display_order');

      if (accounts) {
        setAllAccounts(accounts);
      }
    } catch (error) {
      console.error('Error loading GL suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async (glAccountId: string, suggested?: GLAccount) => {
    setSelectedId(glAccountId);

    // Record decision for learning loop
    if (suggested) {
      await supabase.rpc('record_gl_mapping_decision', {
        p_item_id: itemId,
        p_gl_account_id: glAccountId,
        p_organization_id: organizationId,
        p_suggested_gl_id: suggested.id,
        p_suggestion_confidence: suggested.confidence,
        p_suggestion_reason: suggested.reason,
        p_vendor_id: vendorId || null,
        p_invoice_id: invoiceId || null,
      });
    }

    // Update item GL mapping
    await supabase
      .from('items')
      .update({ gl_account_id: glAccountId })
      .eq('id', itemId);

    await onSelect(glAccountId);
  };

  const getConfidenceBadge = (confidence?: string) => {
    if (!confidence) return null;

    const colors = {
      high: 'bg-sage/10 text-sage border-sage/20',
      medium: 'bg-brass/10 text-brass border-brass/20',
      low: 'bg-opsos-sage-200 text-opsos-sage-700 border-opsos-sage-300',
    };

    return (
      <Badge variant="outline" className={colors[confidence as keyof typeof colors]}>
        {confidence}
      </Badge>
    );
  };

  const getReasonIcon = (reason?: string) => {
    if (reason === 'exact_item_history') return <TrendingUp className="w-3 h-3 text-sage" />;
    if (reason?.includes('pattern')) return <Sparkles className="w-3 h-3 text-brass" />;
    return null;
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading GL accounts...</div>;
  }

  const displayAccounts = showAll ? allAccounts : suggestions.slice(0, 5);

  if (compact) {
    return (
      <select
        value={selectedId || ''}
        onChange={(e) => handleSelect(e.target.value)}
        className="text-sm border rounded px-2 py-1 w-full"
      >
        <option value="">Select GL Account...</option>
        {suggestions.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.external_code} - {acc.name} {acc.confidence ? `(${acc.confidence})` : ''}
          </option>
        ))}
        <option disabled>───────────</option>
        {allAccounts
          .filter((acc) => !suggestions.find((s) => s.id === acc.id))
          .map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.external_code} - {acc.name}
            </option>
          ))}
      </select>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">GL Account for: {itemName}</div>
          <div className="text-xs text-muted-foreground">Category: {itemCategory}</div>
        </div>
        {suggestions.length > 0 && (
          <Badge variant="outline" className="gap-1">
            <Sparkles className="w-3 h-3" />
            AI Suggestions
          </Badge>
        )}
      </div>

      {/* ML Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Recommended:</div>
          {suggestions.slice(0, 3).map((account) => (
            <button
              key={account.id}
              onClick={() => handleSelect(account.id, account)}
              className={`w-full text-left p-3 rounded-lg border-2 transition-all hover:border-brass ${
                selectedId === account.id
                  ? 'border-sage bg-sage/5'
                  : 'border-opsos-sage-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium">{account.external_code}</span>
                    {getConfidenceBadge(account.confidence)}
                    {getReasonIcon(account.reason)}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{account.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {account.section}
                    {account.reason && account.reason !== 'rule_based' && (
                      <span className="ml-2 text-brass">
                        • {account.reason.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
                {selectedId === account.id && (
                  <Check className="w-5 h-5 text-sage flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Show All Toggle */}
      {!showAll && allAccounts.length > suggestions.length && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAll(true)}
          className="w-full"
        >
          Show all {allAccounts.length} GL accounts
        </Button>
      )}

      {/* All Accounts (when expanded) */}
      {showAll && (
        <div className="space-y-1 max-h-64 overflow-y-auto border rounded-lg p-2">
          {allAccounts.map((account) => (
            <button
              key={account.id}
              onClick={() => handleSelect(account.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                selectedId === account.id
                  ? 'bg-sage/10 text-sage font-medium'
                  : 'hover:bg-opsos-sage-100'
              }`}
            >
              <span className="font-mono">{account.external_code}</span>
              <span className="mx-2 text-muted-foreground">•</span>
              <span>{account.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">({account.section})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
