'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';

export function POSImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    imported?: number;
    errors?: string[];
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/reports/import-pos', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          message: `Successfully imported ${data.imported} sales records`,
          imported: data.imported,
        });
        setFile(null);
      } else {
        setResult({
          success: false,
          message: data.error || 'Import failed',
          errors: data.errors,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Network error during upload',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4">Upload Sales Data</h3>

      {/* File Input */}
      <div className="mb-6">
        <label
          htmlFor="pos-file"
          className="block w-full p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-brass hover:bg-muted/50 transition-colors"
        >
          <div className="text-center">
            <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            {file ? (
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium mb-1">Click to upload CSV file</p>
                <p className="text-sm text-muted-foreground">
                  or drag and drop
                </p>
              </div>
            )}
          </div>
          <input
            id="pos-file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {/* Upload Button */}
      <Button
        variant="brass"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full"
      >
        {uploading ? 'Importing...' : 'Import Sales Data'}
      </Button>

      {/* Result Message */}
      {result && (
        <div className={`mt-6 p-4 rounded-lg border ${
          result.success
            ? 'bg-opsos-sage-50 border-opsos-sage-200'
            : 'bg-opsos-error-50 border-opsos-error-200'
        }`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-opsos-sage-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-opsos-error-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-semibold ${
                result.success ? 'text-opsos-sage-800' : 'text-opsos-error-800'
              }`}>
                {result.message}
              </p>
              {result.errors && result.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-opsos-error-700">
                  {result.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
