/**
 * Product Weights Management
 * CSV import/export for bottle tare weights
 */

import { createClient } from '@/lib/supabase/server';
import { WeightsImportForm } from '@/components/inventory/WeightsImportForm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Scale, CheckCircle, AlertCircle } from 'lucide-react';

export default async function ProductWeightsPage() {
  const supabase = await createClient();

  const { data: weights } = await supabase
    .from('v_product_weights_status')
    .select('*')
    .order('item_name');

  const stats = {
    total: weights?.length || 0,
    verified: weights?.filter(w => w.status === 'verified').length || 0,
    measured: weights?.filter(w => w.status === 'measured').length || 0,
    needsVerification: weights?.filter(w => w.status === 'needs_verification').length || 0,
    missing: weights?.filter(w => w.status === 'missing').length || 0,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-header">Product Weights</h1>
        <p className="text-muted-foreground">
          Manage bottle tare weights for scale-based inventory counting
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Total SKUs</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4 border-opsos-sage-300 bg-opsos-sage-50">
          <div className="text-sm text-muted-foreground mb-1">Verified</div>
          <div className="text-2xl font-bold text-opsos-sage-700">{stats.verified}</div>
        </Card>
        <Card className="p-4 border-brass/30 bg-brass/5">
          <div className="text-sm text-muted-foreground mb-1">Measured</div>
          <div className="text-2xl font-bold text-brass">{stats.measured}</div>
        </Card>
        <Card className="p-4 border-yellow-300 bg-yellow-50">
          <div className="text-sm text-muted-foreground mb-1">Needs Verify</div>
          <div className="text-2xl font-bold text-yellow-700">{stats.needsVerification}</div>
        </Card>
        <Card className="p-4 border-opsos-error-200 bg-opsos-error-50">
          <div className="text-sm text-muted-foreground mb-1">Missing</div>
          <div className="text-2xl font-bold text-opsos-error-700">{stats.missing}</div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <Button variant="brass" asChild>
          <a href="/templates/product-weights-template.csv" download>
            <Download className="w-4 h-4 mr-2" />
            Download Template CSV
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/inventory/product-weights/import">
            <Download className="w-4 h-4 mr-2" />
            Export Current Weights
          </a>
        </Button>
      </div>

      {/* Import Form */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Import Product Weights CSV
        </h3>
        <WeightsImportForm />
      </Card>

      {/* Weights Table */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Product Weights Library</h3>

        {weights && weights.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Product</th>
                  <th className="pb-3 font-medium">Brand</th>
                  <th className="pb-3 font-medium">Size</th>
                  <th className="pb-3 font-medium">ABV</th>
                  <th className="pb-3 font-medium">Tare (g)</th>
                  <th className="pb-3 font-medium">Full (g)</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Readings</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {weights.map((weight: any) => (
                  <tr key={weight.sku_id} className="hover:bg-muted/30">
                    <td className="py-3 text-sm">{weight.product_name || weight.item_name}</td>
                    <td className="py-3 text-sm text-muted-foreground">{weight.brand || '—'}</td>
                    <td className="py-3 text-sm">{weight.size_ml} ml</td>
                    <td className="py-3 text-sm">{weight.abv_percent}%</td>
                    <td className="py-3 text-sm font-mono">
                      {weight.empty_g ? `${weight.empty_g}g` : '—'}
                    </td>
                    <td className="py-3 text-sm font-mono">
                      {weight.full_g ? `${weight.full_g}g` : '—'}
                    </td>
                    <td className="py-3">
                      {weight.status === 'verified' && (
                        <Badge variant="sage" className="text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                      {weight.status === 'measured' && (
                        <Badge variant="brass" className="text-xs">
                          <Scale className="w-3 h-3 mr-1" />
                          Measured
                        </Badge>
                      )}
                      {weight.status === 'needs_verification' && (
                        <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Needs Verify
                        </Badge>
                      )}
                      {weight.status === 'missing' && (
                        <Badge variant="outline" className="text-xs border-opsos-error-300 text-opsos-error-700">
                          Missing
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {weight.reading_count || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No product weights found. Import a CSV to get started.
          </div>
        )}
      </Card>
    </div>
  );
}
