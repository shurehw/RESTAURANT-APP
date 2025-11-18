"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (isOpen && !pdfUrl && !error) {
      loadPDF();
    }
  }, [isOpen]);

  const loadPDF = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf-url`);
      if (response.ok) {
        const data = await response.json();
        console.log("PDF URL:", data.url);
        setPdfUrl(data.url);
      } else {
        const errorData = await response.json();
        console.error("Failed to load PDF:", errorData);
        setError(errorData.details || errorData.error || "Failed to load PDF");
      }
    } catch (error) {
      console.error("Error loading PDF:", error);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-lg shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Original Invoice</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* PDF Viewer */}
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">Loading PDF...</div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-brass mb-4" />
                  <h3 className="font-semibold text-lg mb-2">PDF Not Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    {error === "Object not found"
                      ? "The original PDF file could not be found. It may not have been uploaded or the file path is incorrect."
                      : error
                    }
                  </p>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  title="Invoice PDF"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-muted-foreground">PDF not available</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
