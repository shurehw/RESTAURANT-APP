'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, X, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface InvoicePDFViewerProps {
  invoiceId: string;
  invoiceNumber?: string;
  storagePath?: string;
  searchText?: string;
  onClose: () => void;
}

export function InvoicePDFViewer({
  invoiceId,
  invoiceNumber,
  storagePath,
  searchText,
  onClose,
}: InvoicePDFViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPDF();
  }, [storagePath]);

  const loadPDF = async () => {
    if (!storagePath) {
      setError('No PDF available for this invoice');
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: downloadError } = await supabase.storage
        .from('opsos-invoices')
        .createSignedUrl(storagePath, 60 * 60); // 1 hour expiry

      if (downloadError) {
        console.error('Error getting signed URL:', downloadError);
        setError('Failed to load PDF');
        setIsLoading(false);
        return;
      }

      setPdfUrl(data.signedUrl);
      setIsLoading(false);
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError('Failed to load PDF');
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Invoice {invoiceNumber || invoiceId}
            </DialogTitle>
            {searchText && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Search className="w-4 h-4" />
                <span className="text-xs bg-yellow-100 px-2 py-1 rounded">
                  Search for: &quot;{searchText}&quot; (Use Ctrl+F)
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading PDF...</div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-600">{error}</div>
            </div>
          )}

          {pdfUrl && !isLoading && !error && (
            <div className="relative w-full h-full">
              <iframe
                src={pdfUrl}
                className="w-full h-full border rounded"
                title={`Invoice ${invoiceNumber}`}
              />
              {searchText && (
                <div className="absolute top-2 left-2 right-2 bg-yellow-200 border-2 border-yellow-500 rounded p-3 shadow-lg z-10 pointer-events-none">
                  <div className="flex items-start gap-2">
                    <Search className="w-5 h-5 text-yellow-900 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-yellow-900 text-sm mb-1">
                        🔍 Looking for this line item:
                      </div>
                      <div className="font-mono text-xs bg-white p-2 rounded border border-yellow-400 text-yellow-900 max-h-16 overflow-y-auto">
                        {searchText}
                      </div>
                      <div className="text-xs text-yellow-800 mt-2">
                        💡 Tip: Use <kbd className="px-1.5 py-0.5 bg-yellow-100 border border-yellow-400 rounded text-yellow-900 font-mono">Ctrl+F</kbd> to search in the PDF
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {pdfUrl && (
            <Button variant="brass" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                Open in New Tab
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
