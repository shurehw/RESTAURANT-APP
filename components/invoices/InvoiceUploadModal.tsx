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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [venueId, setVenueId] = useState<string>(venues[0]?.id || '');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    newVendor?: string;
    warnings?: string[];
  } | null>(null);

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Invoice</DialogTitle>
          <DialogDescription>
            Upload an invoice image and Claude will extract the data automatically
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Venue Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Venue</label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white"
              required
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Invoice Image</label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                cursor-pointer"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supported formats: JPEG, PNG, WebP, PDF
            </p>
          </div>

          {/* Preview */}
          {preview && (
            <div className="border rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Preview:</p>
              <img
                src={preview}
                alt="Invoice preview"
                className="max-w-full h-auto max-h-64 rounded border"
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
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={!selectedFile || !venueId || uploading}
              className="min-w-32"
            >
              {uploading ? 'Processing...' : 'Upload & Process'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
