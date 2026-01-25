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

    setFiles(prev => prev.map((f, i) =>
      i === index ? { ...f, status: 'uploading' as const } : f
    ));

    try {
      const response = await fetch('/api/invoices/ocr', {
        method: 'POST',
        body: formData,
      });

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
        const details = [
          ...data.results.map((r: any) => `✓ ${r.invoiceNumber || 'Invoice'} from ${r.vendor || 'Unknown'}`),
          ...data.errors.map((e: any) => `✗ ${e.invoiceNumber} from ${e.vendor}: ${e.error.message || e.error}`)
        ].join('\n');

        setFiles(prev => prev.map((f, i) =>
          i === index ? {
            ...f,
            status: data.succeeded > 0 ? 'success' as const : 'error' as const,
            error: data.failed > 0 ? `${summary}\n\n${details}` : undefined,
            invoiceId: data.results[0]?.invoiceId
          } : f
        ));
      } else {
        // Single invoice response
        setFiles(prev => prev.map((f, i) =>
          i === index ? { ...f, status: 'success' as const, invoiceId: data.invoiceId } : f
        ));
      }
      setCompleted(prev => prev + 1);
    } catch (error) {
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

    // Auto-close after 2 seconds if all succeeded
    const allSuccess = files.every(f => f.status === 'success');
    if (allSuccess) {
      setTimeout(() => {
        onOpenChange(false);
        router.refresh();
        setFiles([]);
      }, 2000);
    }
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
                  {uploading ? 'Processing...' : 'Ready to upload'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {completed} / {files.length} files
                </span>
              </div>
              {uploading && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(completed / files.length) * 100}%` }}
                  />
                </div>
              )}
              {completed === files.length && files.length > 0 && (
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {successCount} succeeded
                  </span>
                  {errorCount > 0 && (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errorCount} failed
                    </span>
                  )}
                </div>
              )}
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
                    {fileStatus.error && (
                      <p className="text-xs text-red-600 mt-1">{fileStatus.error}</p>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
