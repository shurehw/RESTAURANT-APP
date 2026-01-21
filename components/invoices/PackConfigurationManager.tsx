'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

export interface PackConfig {
  pack_type: string;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
}

interface PackConfigurationManagerProps {
  baseUom: string;
  packConfigs: PackConfig[];
  onChange: (configs: PackConfig[]) => void;
}

export function PackConfigurationManager({
  baseUom,
  packConfigs,
  onChange,
}: PackConfigurationManagerProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const addPackConfig = () => {
    onChange([...packConfigs, {
      pack_type: 'case',
      units_per_pack: 1,
      unit_size: 1,
      unit_size_uom: baseUom || 'unit',
    }]);
  };

  const removePackConfig = (index: number) => {
    onChange(packConfigs.filter((_, i) => i !== index));
  };

  const updatePackConfig = (index: number, field: keyof PackConfig, value: any) => {
    const updated = packConfigs.map((config, i) =>
      i === index ? { ...config, [field]: value } : config
    );
    onChange(updated);
  };

  // Calculate conversion to recipe units for display
  const calculateConversion = (config: PackConfig): string => {
    const total = config.units_per_pack * config.unit_size;

    // Simple conversion display (actual conversion happens in DB)
    if (config.units_per_pack === 1) {
      return `1 ${config.pack_type} = ${config.unit_size} ${config.unit_size_uom}`;
    }
    return `1 ${config.pack_type} = ${config.units_per_pack} × ${config.unit_size} ${config.unit_size_uom} = ${total} ${config.unit_size_uom}`;
  };

  return (
    <div className="border border-brass/30 rounded-md bg-brass/5">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 text-left flex items-center justify-between hover:bg-brass/10 transition-colors"
      >
        <div className="text-xs font-semibold text-brass">
          Pack Configurations <span className="font-normal text-muted-foreground">(Optional - for purchasing)</span>
        </div>
        <span className="text-brass text-sm">{isExpanded ? '−' : '+'}</span>
      </button>

      {isExpanded && (
        <div className="p-3 pt-0 space-y-3">
          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
            <strong>💡 Add all the ways vendors sell this item</strong>
            <ul className="mt-1 ml-4 list-disc space-y-1">
              <li>Each pack type will convert to <strong>{baseUom || 'recipe unit'}</strong> automatically</li>
              <li>Example: "6/750mL Case" or "750mL Bottle"</li>
              <li>You can add multiple configurations for different vendors</li>
            </ul>
          </div>

          {packConfigs.map((config, index) => (
            <div
              key={index}
              className="border border-opsos-sage-300 rounded-md p-3 bg-white"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-opsos-sage-700">
                  Pack #{index + 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePackConfig(index)}
                  className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* Pack Type */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Pack Type
                  </label>
                  <select
                    value={config.pack_type}
                    onChange={(e) => updatePackConfig(index, 'pack_type', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                  >
                    <option value="case">Case</option>
                    <option value="bottle">Bottle</option>
                    <option value="bag">Bag</option>
                    <option value="box">Box</option>
                    <option value="each">Each</option>
                    <option value="keg">Keg</option>
                    <option value="pail">Pail</option>
                    <option value="drum">Drum</option>
                  </select>
                </div>

                {/* Units per Pack */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Qty/Pack
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={config.units_per_pack}
                    onChange={(e) => updatePackConfig(index, 'units_per_pack', parseFloat(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                  />
                </div>

                {/* Unit Size */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Unit Size
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={config.unit_size}
                      onChange={(e) => updatePackConfig(index, 'unit_size', parseFloat(e.target.value) || 1)}
                      className="w-16 px-2 py-1.5 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                    <select
                      value={config.unit_size_uom}
                      onChange={(e) => updatePackConfig(index, 'unit_size_uom', e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
                    >
                      <optgroup label="Volume">
                        <option value="oz">oz (fl)</option>
                        <option value="mL">mL</option>
                        <option value="L">L</option>
                        <option value="gal">gal</option>
                        <option value="qt">qt</option>
                        <option value="pt">pt</option>
                      </optgroup>
                      <optgroup label="Weight">
                        <option value="lb">lb</option>
                        <option value="oz">oz (wt)</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="unit">unit</option>
                        <option value="each">each</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
              </div>

              {/* Conversion Display */}
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                ✓ {calculateConversion(config)}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPackConfig}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Pack Configuration
          </Button>
        </div>
      )}
    </div>
  );
}
