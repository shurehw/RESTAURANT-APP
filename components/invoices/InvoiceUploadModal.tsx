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

interface Venue {
  id: string;
  name: string;
}

interface InvoiceUploadModalProps {
  venues: Venue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceUploadModal({ venues, open, onOpenChange }: InvoiceUploadModalProps) {
  const router = useRouter();
  const { selectedVenue } = useVenue();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreopening, setIsPreopening] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    newVendor?: string;
    warnings?: string[];
  } | null>(null);

  // Use selected venue from context
  const venueId = selectedVenue?.id || venues[0]?.id || '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setResult(null);

      // Create preview (only for images, not PDFs)
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null); // No preview for PDFs
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || !venueId) {
      setError('Please select a file and venue');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('venue_id', venueId);
      formData.append('is_preopening', isPreopening.toString());

      const response = await fetch('/api/invoices/ocr', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult(data);

      // Close modal and refresh after 1.5 seconds
      setTimeout(() => {
        onOpenChange(false);
        router.refresh();
        // Reset form
        setSelectedFile(null);
        setPreview(null);
        setResult(null);
        setError(null);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Upload Invoice</DialogTitle>
          <DialogDescription className="text-sm">
            Upload an invoice image and Claude will extract the data automatically
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Venue Display (read-only) */}
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
              id="is_preopening"
              checked={isPreopening}
              onChange={(e) => setIsPreopening(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="is_preopening" className="text-sm font-medium cursor-pointer">
              Pre-opening expense (before venue opens)
            </label>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Invoice Image</label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              capture="environment"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500
                file:mr-2 sm:file:mr-4 file:py-3 sm:file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                active:file:bg-primary/80
                cursor-pointer
                touch-manipulation"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tap to take photo or choose file • JPEG, PNG, WebP, PDF
            </p>
          </div>

          {/* Preview */}
          {preview && (
            <div className="border rounded-lg p-3 sm:p-4">
              <p className="text-sm font-medium mb-2">Preview:</p>
              <img
                src={preview}
                alt="Invoice preview"
                className="max-w-full h-auto max-h-48 sm:max-h-64 rounded border"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded p-4">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Success Result */}
          {result && (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded p-4">
              <p className="font-semibold mb-2">Success!</p>
              <p className="text-sm mb-2">
                Invoice created with {result.normalized.lines.length} line items
                {result.normalized.lines.filter((l: any) => l.qty === 0).length > 0 && (
                  <span className="text-orange-700 ml-1">
                    ({result.normalized.lines.filter((l: any) => l.qty === 0).length} backordered)
                  </span>
                )}
              </p>
              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-semibold">Warnings:</p>
                  <ul className="text-sm list-disc list-inside">
                    {result.warnings.map((warning: string, i: number) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm mt-2 text-muted-foreground">
                Closing...
              </p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-2 sm:gap-3">
            <Button
              type="submit"
              disabled={!selectedFile || !venueId || uploading}
              className="flex-1 sm:flex-none sm:min-w-32 h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
            >
              {uploading ? 'Processing...' : 'Upload & Process'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
              className="flex-1 sm:flex-none h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
