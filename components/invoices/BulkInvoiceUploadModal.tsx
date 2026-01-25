'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVenue } from '@/components/providers/VenueProvider';
import { X, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Venue {
  id: string;
  name: string;
}

interface BulkInvoiceUploadModalProps {
  venues: Venue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FileStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: string; // Progress message like "Scanning document...", "Processing invoice 2 of 5..."
  error?: string;
  invoiceId?: string;
}

export function BulkInvoiceUploadModal({ venues, open, onOpenChange }: BulkInvoiceUploadModalProps) {
  const router = useRouter();
  const { selectedVenue } = useVenue();
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isPreopening, setIsPreopening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(0);

  const venueId = selectedVenue?.id || venues[0]?.id || '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const fileStatuses: FileStatus[] = selectedFiles.map(file => ({
      file,
      status: 'pending',
    }));
    setFiles(fileStatuses);
    setCompleted(0);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const uploadFile = async (fileStatus: FileStatus, index: number): Promise<void> => {
    const formData = new FormData();
    formData.append('file', fileStatus.file);
    formData.append('venue_id', venueId);
    formData.append('is_preopening', isPreopening.toString());

    // Progress messages to cycle through
    const progressSteps = [
      'Uploading file...',
      'Scanning document...',
      'Extracting invoice data...',
      'Matching vendors and items...',
      'Finalizing...'
    ];

    let currentStep = 0;

    // Set initial uploading state
    setFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const, progress: progressSteps[0] } : f
    ));

    // Progress animation interval
    const progressInterval = setInterval(() => {
      currentStep = (currentStep + 1) % progressSteps.length;
      setFiles(prev => prev.map((f, i) =>
        i === index && f.status === 'uploading' ? { ...f, progress: progressSteps[currentStep] } : f
      ));
    }, 1500);

    try {
      const response = await fetch('/api/invoices/ocr', {
        method: 'POST',
        body: formData,
      });

      // Clear progress interval
      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        // Provide helpful error messages
        let errorMsg = data.error || 'Upload failed';

        if (data.code === 'DUPLICATE_INVOICE' || response.status === 409) {
          errorMsg = data.message || `Duplicate: ${data.details?.invoiceNumber || 'Invoice already exists'}`;
        } else if (data.error?.includes('23505')) {
          errorMsg = 'Duplicate invoice already in system';
        }

        throw new Error(errorMsg);
      }

      // Handle multi-invoice response
      if (data.multiInvoice) {
        const summary = `Processed ${data.total} invoices: ${data.succeeded} succeeded, ${data.failed} failed`;

        const successDetails = data.results.length > 0
          ? data.results.map((r: any) => `✓ ${r.invoiceNumber || 'Invoice'} from ${r.vendor || 'Unknown'}`).join('\n')
          : '';

        const failDetails = data.errors.length > 0
          ? data.errors.map((e: any) => `✗ ${e.invoiceNumber} from ${e.vendor}: ${e.error.message || e.error}`).join('\n')
          : '';

        const allDetails = [
          successDetails && `Succeeded:\n${successDetails}`,
          failDetails && `Failed:\n${failDetails}`
        ].filter(Boolean).join('\n\n');

        const progressText = allDetails ? `${summary}\n\n${allDetails}` : summary;

        setFiles(prev => prev.map((f, i) =>
          i === index ? {
            ...f,
            status: data.succeeded > 0 ? 'success' as const : 'error' as const,
            progress: progressText,
            invoiceId: data.results[0]?.invoiceId
          } : f
        ));
      } else {
        // Single invoice response - show success details
        const successMsg = `✓ ${data.invoiceNumber || 'Invoice'} from ${data.vendor || 'Unknown vendor'}`;
        setFiles(prev => prev.map((f, i) =>
          i === index ? {
            ...f,
            status: 'success' as const,
            invoiceId: data.invoiceId,
            progress: successMsg
          } : f
        ));
      }
      setCompleted(prev => prev + 1);
    } catch (error) {
      // Clear progress interval on error
      clearInterval(progressInterval);

      setFiles(prev => prev.map((f, i) =>
        i === index ? {
          ...f,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f
      ));
      setCompleted(prev => prev + 1);
    }
  };

  const handleUploadAll = async () => {
    if (!venueId) {
      alert('Please select a venue');
      return;
    }

    setUploading(true);
    setCompleted(0);

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i], i);
    }

    setUploading(false);

    // Don't auto-close - let user review results and close manually
    // Auto-refresh the page to show new invoices
    router.refresh();
  };

  const handleClose = () => {
    if (!uploading) {
      onOpenChange(false);
      setFiles([]);
      setCompleted(0);
    }
  };

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Upload Invoices</DialogTitle>
          <DialogDescription className="text-sm">
            Upload single or multiple invoice files. Multi-invoice PDFs are automatically detected and split. Each invoice will be processed with OCR.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Venue Display */}
          <div>
            <label className="block text-sm font-medium mb-2">Venue</label>
            <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-700">
              {selectedVenue?.name || venues[0]?.name || 'No venue selected'}
            </div>
          </div>

          {/* Pre-opening Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bulk_is_preopening"
              checked={isPreopening}
              onChange={(e) => setIsPreopening(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              disabled={uploading}
            />
            <label htmlFor="bulk_is_preopening" className="text-sm font-medium cursor-pointer">
              Pre-opening expenses (before venue opens)
            </label>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Invoice Files</label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              capture="environment"
              multiple
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-slate-500
                file:mr-2 sm:file:mr-4 file:py-3 sm:file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                active:file:bg-primary/80
                cursor-pointer
                touch-manipulation
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Select multiple files • JPEG, PNG, WebP, PDF
            </p>
          </div>

          {/* Progress Summary */}
          {files.length > 0 && (
            <div className="bg-gray-50 border rounded-lg p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {uploading ? 'Processing...' : completed === files.length ? 'Processing Complete' : 'Ready to upload'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {completed} / {files.length} files processed
                </span>
              </div>
              {uploading && (
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-500 ease-out relative"
                    style={{
                      width: `${Math.max(5, (completed / files.length) * 100)}%`,
                      minWidth: completed === 0 ? '5%' : 'auto'
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                         style={{
                           backgroundSize: '200% 100%',
                           animation: 'shimmer 2s infinite'
                         }}
                    />
                  </div>
                </div>
              )}
              {!uploading && files.length > 0 && completed > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-green-500 h-3 rounded-full"
                    style={{ width: `${(successCount / files.length) * 100}%` }}
                  />
                </div>
              )}
              <style jsx>{`
                @keyframes shimmer {
                  0% { background-position: -200% 0; }
                  100% { background-position: 200% 0; }
                }
              `}</style>
            </div>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {files.map((fileStatus, index) => (
                <div key={index} className="p-3 flex items-center gap-3">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {fileStatus.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                    {fileStatus.status === 'uploading' && (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    )}
                    {fileStatus.status === 'success' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    {fileStatus.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fileStatus.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(fileStatus.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {fileStatus.status === 'uploading' && fileStatus.progress && fileStatus.progress.trim() && (
                      <p className="text-xs text-primary mt-1 animate-pulse">{fileStatus.progress}</p>
                    )}
                    {fileStatus.status === 'success' && fileStatus.progress && fileStatus.progress.trim() && (
                      <p className="text-xs text-gray-700 mt-1 whitespace-pre-line">{fileStatus.progress}</p>
                    )}
                    {fileStatus.error && fileStatus.error.trim() && (
                      <p className="text-xs text-red-600 mt-1 whitespace-pre-line">{fileStatus.error}</p>
                    )}
                  </div>

                  {/* Remove Button */}
                  {!uploading && fileStatus.status === 'pending' && (
                    <button
                      onClick={() => removeFile(index)}
                      className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-3">
            {!uploading && completed === files.length && files.length > 0 ? (
              // Show done button after upload completes
              <Button
                onClick={handleClose}
                className="flex-1 h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Done - View Invoices
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleUploadAll}
                  disabled={files.length === 0 || !venueId || uploading}
                  className="flex-1 sm:flex-none sm:min-w-32 h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing {completed}/{files.length}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload {files.length} {files.length === 1 ? 'File' : 'Files'}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={uploading}
                  className="flex-1 sm:flex-none h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
                >
                  {uploading ? 'Processing...' : 'Cancel'}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
