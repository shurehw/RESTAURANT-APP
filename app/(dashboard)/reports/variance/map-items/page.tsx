'use client';

/**
 * Menu Item → Recipe Mapping Page
 * Admin maps POS menu items to recipes for theoretical COGS calculation.
 * Items are auto-discovered from TipSee data, sorted by revenue (highest first).
 */

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wand2, Check, X, Search } from 'lucide-react';
import Link from 'next/link';

interface MappingRow {
  id: string;
  venue_id: string;
  menu_item_name: string;
  recipe_id: string | null;
  confidence: string;
  sales_30d: number;
  qty_30d: number;
  recipes: { id: string; name: string; cost_per_unit: number; item_category: string } | null;
}

interface Recipe {
  id: string;
  name: string;
  cost_per_unit: number;
  item_category: string;
}

interface Coverage {
  total_items: number;
  mapped_items: number;
  unmapped_items: number;
  coverage_pct: number;
  sales_coverage_pct: number;
}

export default function MapItemsPage() {
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [venueId, setVenueId] = useState<string>('');
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unmapped' | 'mapped'>('all');
  const [search, setSearch] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Load venues
  useEffect(() => {
    async function loadVenues() {
      const { data } = await supabase
        .from('venues')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (data && data.length > 0) {
        setVenues(data);
        setVenueId(data[0].id);
      }
    }
    loadVenues();
  }, []);

  // Load mappings + recipes when venue changes
  const loadData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    const [mappingsRes, recipesRes] = await Promise.all([
      fetch(`/api/cogs/mappings?venue_id=${venueId}`),
      supabase
        .from('recipes')
        .select('id, name, cost_per_unit, item_category')
        .eq('is_active', true)
        .or(`venue_id.eq.${venueId},venue_id.is.null`)
        .order('name'),
    ]);

    if (mappingsRes.ok) {
      const data = await mappingsRes.json();
      setMappings(data.mappings || []);
      setCoverage(data.coverage || null);
    }

    if (recipesRes.data) {
      setRecipes(recipesRes.data);
    }

    setLoading(false);
  }, [venueId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Save mapping
  async function saveMapping(mappingId: string, recipeId: string | null) {
    setSaving(mappingId);
    const res = await fetch('/api/cogs/mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mappingId, recipe_id: recipeId }),
    });
    if (res.ok) {
      await loadData();
    }
    setSaving(null);
  }

  // Auto-match
  async function runAutoMatch() {
    setAutoMatching(true);
    const res = await fetch('/api/cogs/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venue_id: venueId }),
    });
    if (res.ok) {
      const data = await res.json();
      alert(`Matched ${data.matched} of ${data.total_unmapped} unmapped items`);
      await loadData();
    }
    setAutoMatching(false);
  }

  // Filter mappings
  const filtered = mappings.filter((m) => {
    if (filter === 'unmapped' && m.recipe_id) return false;
    if (filter === 'mapped' && !m.recipe_id) return false;
    if (search && !m.menu_item_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <Link
            href="/reports/variance"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Variance Report
          </Link>
          <h1 className="page-header">Map Menu Items to Recipes</h1>
          <p className="text-muted-foreground">
            Link POS items to recipes for theoretical COGS calculation
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {venues.length > 1 && (
            <select
              className="border rounded px-3 py-2 text-sm"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            onClick={runAutoMatch}
            disabled={autoMatching}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {autoMatching ? 'Matching...' : 'Auto-Match'}
          </Button>
        </div>
      </div>

      {/* Coverage Stats */}
      {coverage && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Items</div>
            <div className="text-2xl font-bold font-mono">{coverage.total_items}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Mapped</div>
            <div className="text-2xl font-bold font-mono text-keva-sage-600">
              {coverage.mapped_items}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Unmapped</div>
            <div className={`text-2xl font-bold font-mono ${
              coverage.unmapped_items > 0 ? 'text-keva-error' : 'text-keva-sage-600'
            }`}>
              {coverage.unmapped_items}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Sales Coverage</div>
            <div className={`text-2xl font-bold font-mono ${
              coverage.sales_coverage_pct >= 80 ? 'text-keva-sage-600' :
              coverage.sales_coverage_pct >= 50 ? 'text-brass' :
              'text-keva-error'
            }`}>
              {coverage.sales_coverage_pct}%
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search items..."
            className="w-full pl-9 pr-3 py-2 border rounded text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 border rounded overflow-hidden">
          {(['all', 'unmapped', 'mapped'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-sm capitalize ${
                filter === f ? 'bg-foreground text-background' : 'hover:bg-muted'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Mapping Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {search ? 'No items match your search' :
             filter === 'unmapped' ? 'All items are mapped' :
             'No menu items found. Run a TipSee sync first.'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="text-left text-sm text-muted-foreground border-b bg-muted/30">
              <tr>
                <th className="p-3 font-medium">Menu Item</th>
                <th className="p-3 font-medium text-right">30d Sales</th>
                <th className="p-3 font-medium text-right">30d Qty</th>
                <th className="p-3 font-medium min-w-[280px]">Recipe</th>
                <th className="p-3 font-medium text-right">Unit Cost</th>
                <th className="p-3 font-medium text-center w-12">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filtered.map((m) => (
                <tr key={m.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{m.menu_item_name}</td>
                  <td className="p-3 text-right font-mono">{fmt(m.sales_30d)}</td>
                  <td className="p-3 text-right font-mono">{m.qty_30d.toFixed(0)}</td>
                  <td className="p-3">
                    <select
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      value={m.recipe_id || ''}
                      disabled={saving === m.id}
                      onChange={(e) => saveMapping(m.id, e.target.value || null)}
                    >
                      <option value="">-- Select Recipe --</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.item_category}) — ${r.cost_per_unit?.toFixed(2) || '0.00'}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-right font-mono">
                    {m.recipes?.cost_per_unit
                      ? `$${m.recipes.cost_per_unit.toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="p-3 text-center">
                    {m.recipe_id ? (
                      <Check className="w-4 h-4 text-keva-sage-600 inline" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/40 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
