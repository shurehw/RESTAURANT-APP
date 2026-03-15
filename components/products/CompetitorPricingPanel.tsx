'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ManualPrice = {
  id: string;
  custom_product_id: string | null;
  competitor_name: string | null;
  product_name: string | null;
  variant: string | null;
  category: string | null;
  min_qty: number | null;
  unit_price: number | null;
  source_url: string | null;
  scraped_at: string | null;
  created_at: string | null;
};

type ScrapedPrice = {
  id: string;
  competitor_name: string | null;
  product_name: string | null;
  variant: string | null;
  category: string | null;
  min_qty: number | null;
  unit_price: number | null;
  source_url: string | null;
  scraped_at: string | null;
};

type CustomProduct = {
  id: string;
  name: string;
  sku: string | null;
};

export function CompetitorPricingPanel() {
  const [activeTab, setActiveTab] = useState<'manual' | 'scraped'>('manual');
  const [manualPrices, setManualPrices] = useState<ManualPrice[]>([]);
  const [scrapedPrices, setScrapedPrices] = useState<ScrapedPrice[]>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [search, setSearch] = useState('');
  const [competitorFilter, setCompetitorFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of customProducts) map.set(p.id, p.name);
    return map;
  }, [customProducts]);

  const competitorOptions = useMemo(() => {
    return Array.from(
      new Set(
        scrapedPrices
          .map((p) => p.competitor_name?.trim())
          .filter(Boolean) as string[],
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [scrapedPrices]);

  const filteredManual = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return manualPrices;
    return manualPrices.filter((p) => {
      const haystack = [
        productNameById.get(p.custom_product_id || ''),
        p.competitor_name,
        p.product_name,
        p.variant,
        p.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [manualPrices, search, productNameById]);

  const filteredScraped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scrapedPrices.filter((p) => {
      if (competitorFilter && (p.competitor_name || '') !== competitorFilter) return false;
      if (!q) return true;
      const haystack = [p.competitor_name, p.product_name, p.variant, p.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [scrapedPrices, search, competitorFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products/custom-catalog/competitor-pricing?include_scraped=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load competitor pricing');

      setManualPrices(data.manual_prices || []);
      setScrapedPrices(data.scraped_prices || []);
      setCustomProducts(data.custom_products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const importScraped = async (scrapedId: string) => {
    if (!selectedProductId) {
      setError('Select a custom catalog product before importing.');
      return;
    }

    setImportingId(scrapedId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/products/custom-catalog/competitor-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_product_id: selectedProductId,
          scraped_id: scrapedId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      if (data.reason === 'already_exists') {
        setMessage('This scraped row is already linked for the selected product.');
      } else {
        setMessage('Imported scraped price into manual linked pricing.');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div
      className="space-y-4"
      data-competitor-pricing-ready={loading ? 'false' : 'true'}
    >
      <div>
        <h1 className="text-2xl font-bold text-ledger-black">Custom Catalog Competitor Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review linked/manual competitor prices and import scraped competitor data.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-3 py-2 text-sm rounded-md border ${
              activeTab === 'manual'
                ? 'bg-keva-sage-600 text-white border-keva-sage-600'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Manual & Linked Prices ({manualPrices.length})
          </button>
          <button
            onClick={() => setActiveTab('scraped')}
            className={`px-3 py-2 text-sm rounded-md border ${
              activeTab === 'scraped'
                ? 'bg-keva-sage-600 text-white border-keva-sage-600'
                : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            Scraped Prices ({scrapedPrices.length})
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search competitor, product, variant..."
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          />
          <select
            value={competitorFilter}
            onChange={(e) => setCompetitorFilter(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
            disabled={activeTab !== 'scraped'}
          >
            <option value="">All competitors</option>
            {competitorOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">Select custom catalog product for import</option>
            {customProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.sku ? ` (${p.sku})` : ''}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
        {message && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{message}</div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground py-6">Loading competitor pricing...</div>
        ) : activeTab === 'manual' ? (
          <TableShell>
            <thead className="bg-gray-50">
              <tr>
                <Th>Custom Product</Th>
                <Th>Competitor</Th>
                <Th>Product</Th>
                <Th>Variant</Th>
                <Th>Category</Th>
                <Th>Min Qty</Th>
                <Th>Unit Price</Th>
                <Th>Source</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {filteredManual.length === 0 && (
                <tr><Td colSpan={9}>No manual or linked prices found.</Td></tr>
              )}
              {filteredManual.map((row) => (
                <tr key={row.id} className="border-t">
                  <Td>{row.custom_product_id ? (productNameById.get(row.custom_product_id) || row.custom_product_id) : '—'}</Td>
                  <Td>{row.competitor_name || '—'}</Td>
                  <Td>{row.product_name || '—'}</Td>
                  <Td>{row.variant || '—'}</Td>
                  <Td>{row.category || '—'}</Td>
                  <Td>{row.min_qty ?? '—'}</Td>
                  <Td>{formatPrice(row.unit_price)}</Td>
                  <Td>{renderSource(row.source_url)}</Td>
                  <Td>{formatDate(row.scraped_at || row.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <TableShell>
            <thead className="bg-gray-50">
              <tr>
                <Th>Competitor</Th>
                <Th>Product</Th>
                <Th>Variant</Th>
                <Th>Category</Th>
                <Th>Min Qty</Th>
                <Th>Unit Price</Th>
                <Th>Source URL</Th>
                <Th>Scrape Date</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {filteredScraped.length === 0 && (
                <tr><Td colSpan={9}>No scraped prices found.</Td></tr>
              )}
              {filteredScraped.map((row) => (
                <tr key={row.id} className="border-t">
                  <Td>{row.competitor_name || '—'}</Td>
                  <Td>{row.product_name || '—'}</Td>
                  <Td>{row.variant || '—'}</Td>
                  <Td>{row.category || '—'}</Td>
                  <Td>{row.min_qty ?? '—'}</Td>
                  <Td>{formatPrice(row.unit_price)}</Td>
                  <Td>{renderSource(row.source_url)}</Td>
                  <Td>{formatDate(row.scraped_at)}</Td>
                  <Td>
                    <Button
                      size="sm"
                      onClick={() => importScraped(row.id)}
                      disabled={!selectedProductId || importingId === row.id}
                    >
                      {importingId === row.id ? 'Importing...' : 'Import'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-md">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-medium text-gray-600 px-3 py-2 whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td className="px-3 py-2 align-top text-gray-900" colSpan={colSpan}>
      {children}
    </td>
  );
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function renderSource(url: string | null) {
  if (!url) return '—';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-700 hover:text-blue-900 underline"
    >
      Link
    </a>
  );
}
