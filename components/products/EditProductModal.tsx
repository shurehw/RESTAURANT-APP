'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Trash2 } from 'lucide-react';
import { PackConfigurationManager } from '@/components/invoices/PackConfigurationManager';

// Normalize category names for display
function normalizeCategoryName(category: string): string {
  const categoryMap: Record<string, string> = {
    'liquor': 'Liquor',
    'wine': 'Wine',
    'beer': 'Beer',
    'bar_consumable': 'Bar Consumable',
    'bar_consumables': 'Bar Consumables',
    'non_alcoholic_beverage': 'Non-Alcoholic Beverage',
    'produce': 'Produce',
    'meat': 'Meat',
    'seafood': 'Seafood',
    'dairy': 'Dairy',
    'bakery': 'Bakery',
    'grocery': 'Grocery',
    'dry_goods': 'Dry Goods',
    'frozen': 'Frozen',
    'food': 'Food',
    'packaging': 'Packaging',
    'disposables': 'Disposables',
    'chemicals': 'Chemicals / Cleaning',
    'smallwares': 'Smallwares',
    'supplies': 'Supplies',
    'other': 'Other',
  };
  return categoryMap[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

// Normalize UOM names for display
function normalizeUomName(uom: string): string {
  const uomMap: Record<string, string> = {
    'oz': 'Ounce (oz)',
    'cup': 'Cup',
    'pt': 'Pint',
    'qt': 'Quart',
    'gal': 'Gallon',
    'lb': 'Pound (lb)',
    'oz-wt': 'Ounce (weight)',
    'ml': 'Milliliter (ml)',
    'L': 'Liter (L)',
    'g': 'Gram (g)',
    'kg': 'Kilogram (kg)',
    'unit': 'Unit/Each',
    'each': 'Unit/Each',
    'case': 'Case',
  };
  return uomMap[uom] || uom;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory: string | null;
  base_uom: string;
  gl_account_id: string | null;
  item_pack_configurations: Array<{
    id?: string;
    pack_type: string;
    units_per_pack: number;
    unit_size: number;
    unit_size_uom: string;
  }>;
}

interface EditProductModalProps {
  product: Product;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
}

export function EditProductModal({ product, onClose, onSave }: EditProductModalProps) {
  const [editedProduct, setEditedProduct] = useState<Product>(product);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedProduct);
      onClose();
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-opsos-sage-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-ledger-black">Edit Product</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-opsos-sage-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Product Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Product Name *
            </label>
            <Input
              value={editedProduct.name}
              onChange={(e) => setEditedProduct({ ...editedProduct, name: e.target.value })}
              placeholder="e.g., Tito's Vodka 750ml"
            />
          </div>

          {/* SKU */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              SKU
            </label>
            <Input
              value={editedProduct.sku}
              onChange={(e) => setEditedProduct({ ...editedProduct, sku: e.target.value })}
              placeholder="e.g., AUTO-123456"
              className="font-mono"
            />
          </div>

          {/* Category & Subcategory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Category *
              </label>
              <select
                value={editedProduct.category}
                onChange={(e) => setEditedProduct({ ...editedProduct, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
              >
                <optgroup label="Alcoholic Beverages">
                  <option value="liquor">Liquor</option>
                  <option value="wine">Wine</option>
                  <option value="beer">Beer</option>
                </optgroup>
                <optgroup label="Non-Alcoholic">
                  <option value="bar_consumable">Bar Consumable</option>
                  <option value="non_alcoholic_beverage">Non-Alcoholic Beverage</option>
                </optgroup>
                <optgroup label="Food">
                  <option value="produce">Produce</option>
                  <option value="meat">Meat</option>
                  <option value="seafood">Seafood</option>
                  <option value="dairy">Dairy</option>
                  <option value="bakery">Bakery</option>
                  <option value="grocery">Grocery</option>
                  <option value="dry_goods">Dry Goods</option>
                  <option value="frozen">Frozen</option>
                  <option value="food">Food (General)</option>
                </optgroup>
                <optgroup label="Supplies">
                  <option value="bar_consumables">Bar Consumables</option>
                  <option value="packaging">Packaging</option>
                  <option value="disposables">Disposables</option>
                  <option value="chemicals">Chemicals / Cleaning</option>
                  <option value="smallwares">Smallwares</option>
                  <option value="supplies">Supplies (General)</option>
                </optgroup>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Subcategory
              </label>
              <Input
                value={editedProduct.subcategory || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, subcategory: e.target.value })}
                placeholder="e.g., Vodka, Tequila, etc."
              />
            </div>
          </div>

          {/* Recipe Unit */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Recipe Unit (Base UOM) *
            </label>
            <select
              value={editedProduct.base_uom}
              onChange={(e) => setEditedProduct({ ...editedProduct, base_uom: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-opsos-sage-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brass"
            >
              <optgroup label="Volume (US)">
                <option value="oz">Ounce (oz)</option>
                <option value="cup">Cup</option>
                <option value="pt">Pint</option>
                <option value="qt">Quart</option>
                <option value="gal">Gallon</option>
              </optgroup>
              <optgroup label="Weight">
                <option value="lb">Pound</option>
                <option value="oz-wt">Ounce (weight)</option>
              </optgroup>
              <optgroup label="Metric Volume">
                <option value="ml">Milliliter</option>
                <option value="L">Liter</option>
              </optgroup>
              <optgroup label="Metric Weight">
                <option value="g">Gram</option>
                <option value="kg">Kilogram</option>
              </optgroup>
              <optgroup label="Other">
                <option value="unit">Unit/Each</option>
                <option value="case">Case</option>
              </optgroup>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              💡 This is how recipes measure this product (e.g., 'oz' for liquor in cocktails)
            </p>
          </div>

          {/* Pack Configurations */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">
              Pack Configurations
            </label>
            <PackConfigurationManager
              baseUom={editedProduct.base_uom}
              packConfigs={editedProduct.item_pack_configurations}
              onChange={(configs) => setEditedProduct({ ...editedProduct, item_pack_configurations: configs })}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-opsos-sage-200 sticky bottom-0 bg-white">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="brass"
            onClick={handleSave}
            disabled={isSaving || !editedProduct.name || !editedProduct.base_uom}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
