'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle } from 'lucide-react';

export function WeightsImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    imported?: number;
    failed?: number;
    errors?: string[];
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setResult(null);
    } else {
      alert('Please select a valid CSV file');
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      // Parse CSV
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        return row;
      });

      // Send to API
      const response = await fetch('/api/inventory/product-weights/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setFile(null);

      // Refresh page after successful import
      if (data.imported > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error: any) {
      console.error('Import error:', error);
      setResult({
        success: false,
        errors: [error.message],
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* File Input */}
      <div>
        <label
          htmlFor="csv-upload"
          className="block w-full p-8 border-2 border-dashed border-opsos-sage-300 rounded-md hover:border-brass hover:bg-brass/5 transition-colors cursor-pointer text-center"
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-opsos-sage-500" />
          <div className="text-sm font-medium mb-1">
            {file ? file.name : 'Click to select CSV file'}
          </div>
          <div className="text-xs text-muted-foreground">
            CSV with columns: sku_id, size_ml, abv_percent, tare_g, etc.
          </div>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {/* Import Button */}
      {file && (
        <Button
          onClick={handleImport}
          disabled={importing}
          variant="brass"
          className="w-full"
        >
          {importing ? 'Importing...' : 'Import Weights'}
        </Button>
      )}

      {/* Result */}
      {result && (
        <div
          className={`p-4 rounded-md ${
            result.success && result.imported! > 0
              ? 'bg-opsos-sage-50 border border-opsos-sage-300'
              : 'bg-opsos-error-50 border border-opsos-error-300'
          }`}
        >
          {result.success && result.imported! > 0 ? (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-opsos-sage-600 mt-0.5" />
              <div>
                <div className="font-medium text-opsos-sage-800">Import Successful</div>
                <div className="text-sm text-opsos-sage-700">
                  {result.imported} product weights imported
                  {result.failed! > 0 && `, ${result.failed} failed`}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <XCircle className="w-5 h-5 text-opsos-error-600 mt-0.5" />
              <div>
                <div className="font-medium text-opsos-error-800">Import Failed</div>
                <div className="text-sm text-opsos-error-700 space-y-1 mt-2">
                  {result.errors?.map((error, i) => (
                    <div key={i}>• {error}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
