'use client';

import { useState, useEffect } from 'react';
import { useBleScale } from '@/hooks/useBleScale';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Bluetooth,
  Scale,
  Check,
  AlertCircle,
  Loader2,
  Search,
} from 'lucide-react';

interface ScaleCounterProps {
  venueId: string;
  countSessionId: string;
  onCountRecorded?: (data: { skuId: string; remainingMl: number; fillRatio: number }) => void;
}

export function ScaleCounter({ venueId, countSessionId, onCountRecorded }: ScaleCounterProps) {
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [skuData, setSkuData] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [lastReading, setLastReading] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    connect,
    disconnect,
    isConnected,
    isConnecting,
    currentWeight,
    error: scaleError,
  } = useBleScale();

  // Fetch SKU weight data when selected
  useEffect(() => {
    if (selectedSku) {
      fetchSkuData(selectedSku);
    } else {
      setSkuData(null);
    }
  }, [selectedSku]);

  const fetchSkuData = async (skuId: string) => {
    try {
      const response = await fetch(`/api/inventory/weigh?skuId=${skuId}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to fetch product weight data');
        setSkuData(null);
        return;
      }
      const data = await response.json();
      setSkuData(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setSkuData(null);
    }
  };

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleUseWeight = async () => {
    if (!currentWeight || !selectedSku) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/inventory/weigh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          venueId,
          countSessionId,
          skuId: selectedSku,
          weightG: currentWeight,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process weight');
      }

      setLastReading(data);

      // Notify parent
      if (onCountRecorded) {
        onCountRecorded({
          skuId: selectedSku,
          remainingMl: data.remainingMl,
          fillRatio: data.fillRatio,
        });
      }

      // Clear selection for next item
      setSelectedSku(null);
      setSkuData(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Scale Connection */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bluetooth className="w-5 h-5 text-opsos-sage-600" />
            <div>
              <div className="font-medium">Bluetooth Scale</div>
              <div className="text-sm text-muted-foreground">
                {isConnected ? (
                  <span className="text-opsos-sage-600">Connected</span>
                ) : (
                  <span>Not connected</span>
                )}
              </div>
            </div>
          </div>

          {!isConnected ? (
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              variant="brass"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Bluetooth className="w-4 h-4 mr-2" />
                  Connect Scale
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleDisconnect} variant="outline">
              Disconnect
            </Button>
          )}
        </div>

        {scaleError && (
          <div className="mt-3 p-3 bg-opsos-error-50 border border-opsos-error-200 rounded-md text-sm text-opsos-error-700">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            {scaleError}
          </div>
        )}
      </Card>

      {/* Current Weight Display */}
      {isConnected && (
        <Card className="p-6 bg-opsos-sage-50 border-opsos-sage-300">
          <div className="text-center">
            <Scale className="w-8 h-8 mx-auto mb-2 text-opsos-sage-600" />
            <div className="text-4xl font-bold font-mono text-opsos-sage-800">
              {currentWeight !== null ? `${currentWeight.toFixed(1)}g` : '---'}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Live Weight</div>
          </div>
        </Card>
      )}

      {/* SKU Selection */}
      <Card className="p-4">
        <div className="mb-3">
          <label className="block text-sm font-medium mb-2">Select Product</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter SKU ID or search..."
              value={selectedSku || ''}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="flex-1 px-3 py-2 border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
            />
            <Button variant="outline" size="sm">
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* SKU Info */}
        {skuData && (
          <div className="p-3 bg-muted rounded-md space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product:</span>
              <span className="font-medium">{skuData.product_name || skuData.item_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size:</span>
              <span>{skuData.size_ml} ml • {skuData.abv_percent}% ABV</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tare Weight:</span>
              <span className="font-mono">{skuData.empty_g}g</span>
            </div>
            {skuData.full_g && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Full Weight:</span>
                <span className="font-mono">{skuData.full_g}g</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={skuData.status === 'verified' ? 'sage' : 'outline'}>
                {skuData.status}
              </Badge>
            </div>
          </div>
        )}
      </Card>

      {/* Use Weight Button */}
      {isConnected && selectedSku && skuData && currentWeight !== null && (
        <Button
          onClick={handleUseWeight}
          disabled={processing}
          variant="brass"
          size="lg"
          className="w-full"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Recording...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Use Weight ({currentWeight.toFixed(1)}g)
            </>
          )}
        </Button>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-opsos-error-50 border border-opsos-error-200 rounded-md text-sm text-opsos-error-700">
          <AlertCircle className="w-4 h-4 inline mr-2" />
          {error}
        </div>
      )}

      {/* Last Reading */}
      {lastReading && (
        <Card className="p-4 bg-opsos-sage-50 border-opsos-sage-300">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-opsos-sage-600 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-opsos-sage-800 mb-2">Reading Recorded</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Fill:</span>{' '}
                  <span className="font-medium">{(lastReading.fillRatio * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Remaining:</span>{' '}
                  <span className="font-medium">{lastReading.remainingMl.toFixed(0)} ml</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Method:</span>{' '}
                  <Badge variant="outline" className="text-xs">
                    {lastReading.method}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
