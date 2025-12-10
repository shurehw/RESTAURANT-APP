'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText } from 'lucide-react';
import { VendorInvoiceUpload } from './VendorInvoiceUpload';
import { VendorStatementUpload } from './VendorStatementUpload';

type Invoice = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'exported';
  venues: {
    name: string;
  } | null;
};

type VendorInvoiceListProps = {
  vendorId: string;
};

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  exported: 'bg-blue-100 text-blue-800',
};

const statusLabels = {
  draft: 'Draft',
  pending_approval: 'Pending',
  approved: 'Approved',
  exported: 'Paid',
};

export function VendorInvoiceList({ vendorId }: VendorInvoiceListProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showStatementUpload, setShowStatementUpload] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, [vendorId]);

  const loadInvoices = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, total_amount, status, venues(name)')
      .eq('vendor_id', vendorId)
      .order('invoice_date', { ascending: false });

    if (!error && data) {
      // Transform data to handle venues as object or array
      const transformedData = data.map((inv: any) => ({
        ...inv,
        venues: Array.isArray(inv.venues) ? inv.venues[0] || null : inv.venues,
      }));
      setInvoices(transformedData);
    }
    setLoading(false);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter = filter === 'all' || inv.status === filter;
    const matchesSearch =
      !search ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.venues?.name?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading invoices...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Upload buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Invoices</h2>
        <div className="flex gap-2">
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Invoice
          </Button>
          <Button variant="outline" onClick={() => setShowStatementUpload(true)}>
            <FileText className="w-4 h-4 mr-2" />
            Upload Statement
          </Button>
        </div>
      </div>

      {/* Upload Modals */}
      {showUpload && (
        <VendorInvoiceUpload
          vendorId={vendorId}
          onSuccess={loadInvoices}
          onClose={() => setShowUpload(false)}
        />
      )}

      {showStatementUpload && (
        <VendorStatementUpload
          vendorId={vendorId}
          onSuccess={loadInvoices}
          onClose={() => setShowStatementUpload(false)}
        />
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
              size="sm"
            >
              All
            </Button>
            <Button
              variant={filter === 'pending_approval' ? 'default' : 'outline'}
              onClick={() => setFilter('pending_approval')}
              size="sm"
            >
              Pending
            </Button>
            <Button
              variant={filter === 'approved' ? 'default' : 'outline'}
              onClick={() => setFilter('approved')}
              size="sm"
            >
              Approved
            </Button>
            <Button
              variant={filter === 'exported' ? 'default' : 'outline'}
              onClick={() => setFilter('exported')}
              size="sm"
            >
              Paid
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No invoices found
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Venue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invoice.invoice_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {invoice.venues?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {invoice.due_date ? formatDate(invoice.due_date) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {formatCurrency(invoice.total_amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={statusColors[invoice.status]}>
                      {statusLabels[invoice.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total Invoices</div>
          <div className="text-2xl font-bold">{filteredInvoices.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Pending</div>
          <div className="text-2xl font-bold text-yellow-600">
            {filteredInvoices.filter((i) => i.status === 'pending_approval').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Approved</div>
          <div className="text-2xl font-bold text-green-600">
            {filteredInvoices.filter((i) => i.status === 'approved').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total Amount</div>
          <div className="text-2xl font-bold">
            {formatCurrency(
              filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
