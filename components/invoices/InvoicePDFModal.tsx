"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, X, AlertCircle } from "lucide-react";

interface InvoicePDFModalProps {
  invoiceId: string;
}

export function InvoicePDFModal({ invoiceId }: InvoicePDFModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (isOpen && !pdfUrl && !error) {
      loadPDF();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  const loadPDF = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf-url`);
      if (response.ok) {
        const data = await response.json();
        setPdfUrl(data.url);

        // Detect if it's an image based on URL extension
        const url = data.url.toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const isImageFile = imageExtensions.some(ext => url.includes(ext));
        setIsImage(isImageFile);
      } else {
        const errorData = await response.json();
        setError(errorData.details || errorData.error || "Failed to load PDF");
      }
    } catch {
      setError("Network error loading PDF");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <FileText className="w-4 h-4 mr-2" />
        View Original
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Original Invoice"
        >
          <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-lg shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Original Invoice</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={close}
                aria-label="Close"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* PDF/Image Viewer */}
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading invoice...</div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-brass mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Invoice Not Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    {error === "Object not found"
                      ? "The original invoice file could not be found. It may not have been uploaded or the file path is incorrect."
                      : error
                    }
                  </p>
                </div>
              ) : pdfUrl ? (
                isImage ? (
                  <div className="w-full h-full overflow-auto flex items-start justify-center bg-slate-100 p-4">
                    <img
                      src={pdfUrl}
                      alt="Invoice"
                      className="max-w-full h-auto object-contain"
                    />
                  </div>
                ) : (
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full border-0"
                    title="Invoice PDF"
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Invoice not available</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
