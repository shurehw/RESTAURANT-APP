/**
 * components/invoices/InvoiceTable.tsx
 * Client component for invoice table with multi-select and batch approval.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatDate } from '@/lib/utils';
import { approveInvoices } from '@/lib/actions/invoices';
import { Button } from '@/components/ui/button';

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: string;
  ocr_confidence: number | null;
  vendor: { id: string; name: string } | null;
  venue: { id: string; name: string } | null;
}

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const router = useRouter();

  const toggleSelect = (id: string) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelected(newSet);
  };

  const toggleSelectAll = () => {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map(inv => inv.id)));
    }
  };

  const handleApprove = async () => {
    if (selected.size === 0) return;

    setIsApproving(true);
    try {
      await approveInvoices(Array.from(selected));
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      console.error('Error approving invoices:', err);
      alert('Failed to approve invoices');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="w-12 p-3">
                <input
                  type="checkbox"
                  checked={selected.size === invoices.length && invoices.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-input"
                />
              </th>
              <th className="text-left p-3 font-medium text-sm">Invoice #</th>
              <th className="text-left p-3 font-medium text-sm">Vendor</th>
              <th className="text-left p-3 font-medium text-sm">Venue</th>
              <th className="text-left p-3 font-medium text-sm">Date</th>
              <th className="text-right p-3 font-medium text-sm">Amount</th>
              <th className="text-center p-3 font-medium text-sm">Confidence</th>
              <th className="text-left p-3 font-medium text-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="border-b last:border-0 hover:bg-muted/50 transition-colors"
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleSelect(inv.id)}
                    className="rounded border-input"
                  />
                </td>
                <td className="p-3">
                  <a
                    href={`/invoices/${inv.id}`}
                    className="text-primary hover:underline font-mono text-sm"
                  >
                    {inv.invoice_number || '(no number)'}
                  </a>
                </td>
                <td className="p-3 text-sm">{inv.vendor?.name || '—'}</td>
                <td className="p-3 text-sm">{inv.venue?.name || '—'}</td>
                <td className="p-3 text-sm">{formatDate(inv.invoice_date)}</td>
                <td className="p-3 text-right font-mono text-sm">
                  {formatCurrency(inv.total_amount)}
                </td>
                <td className="p-3 text-center">
                  {inv.ocr_confidence !== null && (
                    <ConfidenceBadge confidence={inv.ocr_confidence} />
                  )}
                </td>
                <td className="p-3">
                  <StatusBadge status={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {invoices.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No invoices found
          </div>
        )}
      </div>

      {/* Batch Actions */}
      {selected.size > 0 && (
        <div className="mt-4 flex justify-end items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <Button onClick={handleApprove} disabled={isApproving}>
            {isApproving ? 'Approving...' : `Approve Selected (${selected.size})`}
          </Button>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    pending_approval: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    exported: 'bg-blue-100 text-blue-800',
  };

  return (
    <span
      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
        colors[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  let color = 'bg-green-100 text-green-800';

  if (confidence < 0.7) {
    color = 'bg-red-100 text-red-800';
  } else if (confidence < 0.9) {
    color = 'bg-yellow-100 text-yellow-800';
  }

  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${color}`}>
      {pct}%
    </span>
  );
}
