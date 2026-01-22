'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ParsedItem {
  ITEM: string;
  PACK_SIZE: string;
  SKU: string;
  Item_Category_1: string;
  SUBCATEGORY: string;
  Measure_Type: string;
  Reporting_U_of_M: string;
  Inventory_U_of_M: string;
  Cost_Account: string;
  Inventory_Account: string;
  Cost_Update_Method: string;
  Key_Item: boolean;
}

export function ItemBulkImport() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const [itemType, setItemType] = useState<'beverage' | 'food' | 'other'>('beverage');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);

    try {
      // Read Excel file
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON (preserve header spacing)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

      // Normalize column names (remove trailing spaces)
      const normalized = jsonData.map((row: any) => {
        const normalizedRow: any = {};
        for (const key in row) {
          const cleanKey = key.trim().replace(/\s+/g, '_');
          normalizedRow[cleanKey] = row[key];
        }
        return normalizedRow;
      });

      console.log('Parsed Excel data:', normalized.length, 'rows');
      console.log('Sample row:', normalized[0]);

      setParsedData(normalized);
    } catch (error) {
      console.error('Failed to parse Excel:', error);
      alert('Failed to parse Excel file. Please check the format.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      alert('No data to import');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/items/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedData, item_type: itemType }),
      });

      const result = await response.json();
      console.log('Import result:', result);

      if (response.ok) {
        setImportResults(result.results);
        alert(`Import complete!\n✓ Created: ${result.results.created}\n✗ Skipped: ${result.results.skipped}`);
      } else {
        alert(`Import failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import items');
    } finally {
      setIsProcessing(false);
    }
  };

  // Group items by name to show consolidation preview
  const consolidatedItems = new Map<string, ParsedItem[]>();
  for (const item of parsedData) {
    const name = item.ITEM?.trim();
    if (!name) continue;

    if (!consolidatedItems.has(name)) {
      consolidatedItems.set(name, []);
    }
    consolidatedItems.get(name)!.push(item);
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ledger-black mb-2">Bulk Item Import</h2>
        <p className="text-sm text-muted-foreground">
          Upload an R365 Excel export to bulk import items. Items with multiple pack sizes will be consolidated.
        </p>
      </div>

      {/* Item Type Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-ledger-black mb-2">
          Item Type
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={itemType === 'beverage' ? 'brass' : 'outline'}
            size="sm"
            onClick={() => setItemType('beverage')}
          >
            Beverage
          </Button>
          <Button
            type="button"
            variant={itemType === 'food' ? 'brass' : 'outline'}
            size="sm"
            onClick={() => setItemType('food')}
          >
            Food
          </Button>
          <Button
            type="button"
            variant={itemType === 'other' ? 'brass' : 'outline'}
            size="sm"
            onClick={() => setItemType('other')}
          >
            Other
          </Button>
        </div>
      </div>

      {/* File Upload */}
      <div className="mb-6">
        <label htmlFor="excel-upload" className="block mb-2 cursor-pointer">
          <div className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-opsos-sage-300 rounded-md hover:border-brass hover:bg-brass/5 transition-colors">
            <Upload className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {file ? file.name : 'Click to choose Excel file (.xlsx)'}
            </span>
          </div>
        </label>
        <input
          id="excel-upload"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
        />

        {parsedData.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-sm text-sage">
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {parsedData.length} rows → {consolidatedItems.size} unique items
            </span>
          </div>
        )}
      </div>

      {/* Preview */}
      {parsedData.length > 0 && !importResults && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-ledger-black mb-2">Preview (first 10 items)</h3>
          <div className="border border-opsos-sage-200 rounded-md max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-opsos-sage-50 sticky top-0">
                <tr className="border-b border-opsos-sage-200">
                  <th className="text-left p-2 font-semibold">Item</th>
                  <th className="text-left p-2 font-semibold">Pack Sizes</th>
                  <th className="text-left p-2 font-semibold">Category</th>
                  <th className="text-left p-2 font-semibold">GL Account</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(consolidatedItems.entries()).slice(0, 10).map(([name, rows], idx) => (
                  <tr key={idx} className="border-b border-opsos-sage-100 hover:bg-opsos-sage-50/50">
                    <td className="p-2 font-mono text-ledger-black">{name}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {rows.map((row, i) => (
                          <span key={i} className="px-2 py-0.5 bg-brass/10 text-brass rounded text-xs font-mono">
                            {row.PACK_SIZE || 'N/A'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">{rows[0].SUBCATEGORY || 'N/A'}</td>
                    <td className="p-2 text-muted-foreground font-mono text-xs">
                      {rows[0].Cost_Account || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Showing 10 of {consolidatedItems.size} items. Items with multiple pack sizes will be created once with multiple pack configurations.
          </p>
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2 p-3 bg-sage-50 border border-sage-200 rounded-md">
            <CheckCircle className="w-5 h-5 text-sage flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-sage-900">Success:</span>{' '}
              <span className="text-sage-700">{importResults.created} items created</span>
            </div>
          </div>

          {importResults.skipped > 0 && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-orange-900">Skipped:</span>{' '}
                <span className="text-orange-700">{importResults.skipped} items</span>
              </div>
            </div>
          )}

          {importResults.errors && importResults.errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start gap-2 mb-2">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-red-900">Errors:</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {importResults.errors.slice(0, 10).map((err: any, idx: number) => (
                  <div key={idx} className="text-xs text-red-700 mb-1">
                    <span className="font-mono">{err.item}</span>: {err.error}
                  </div>
                ))}
                {importResults.errors.length > 10 && (
                  <div className="text-xs text-red-600 mt-2">
                    ... and {importResults.errors.length - 10} more errors
                  </div>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Import Another File
          </Button>
        </div>
      )}

      {/* Import Button */}
      {parsedData.length > 0 && !importResults && (
        <div className="flex gap-3">
          <Button
            onClick={handleImport}
            disabled={isProcessing}
            className="flex-1 bg-brass hover:bg-brass-dark text-white"
          >
            {isProcessing ? (
              <>Processing {consolidatedItems.size} items...</>
            ) : (
              <>Import {consolidatedItems.size} Items</>
            )}
          </Button>
          <Button
            onClick={() => {
              setFile(null);
              setParsedData([]);
              setImportResults(null);
            }}
            variant="outline"
            disabled={isProcessing}
          >
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}
