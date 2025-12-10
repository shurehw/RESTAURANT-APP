'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { X, Upload, Loader2 } from 'lucide-react';

type VendorInvoiceUploadProps = {
  vendorId: string;
  onSuccess: () => void;
  onClose: () => void;
};

export function VendorInvoiceUpload({
  vendorId,
  onSuccess,
  onClose,
}: VendorInvoiceUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.includes('pdf') && !selectedFile.type.includes('image')) {
        setError('Please upload a PDF or image file');
        return;
      }
      // Validate file size (10MB max)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Upload to vendor API endpoint with OCR processing
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/vendor/invoices/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Upload failed');
      }

      // Success - notify parent
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Upload Invoice</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={uploading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Select Invoice File
            </label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              PDF or image files, max 10MB
            </p>
          </div>

          {file && (
            <div className="bg-gray-50 rounded p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-sm">{file.name}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={uploading}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t text-xs text-gray-500">
          <p className="mb-2">Your invoice will be:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Automatically processed with OCR</li>
            <li>Saved with pending approval status</li>
            <li>Reviewed by the venue team</li>
            <li>You'll see status updates here in real-time</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
