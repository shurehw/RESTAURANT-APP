'use client';

/**
 * Item Specifications Editor
 *
 * Edits the canonical specifications JSONB on an item.
 * Pre-defined fields for common specs (brand, grade, trim, etc.)
 * plus freeform key-value pairs for custom specs.
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save } from 'lucide-react';

const PREDEFINED_FIELDS = [
  { key: 'brand', label: 'Brand', placeholder: 'e.g. Swift, Sysco' },
  { key: 'grade', label: 'Grade', placeholder: 'e.g. USDA Choice, Prime' },
  { key: 'trim', label: 'Trim', placeholder: 'e.g. PSMO, CAB' },
  { key: 'species', label: 'Species', placeholder: 'e.g. beef, chicken, salmon' },
  { key: 'cut', label: 'Cut', placeholder: 'e.g. tenderloin, ribeye' },
  { key: 'pack_size', label: 'Pack Size', placeholder: 'e.g. 4x28#, 10 lb case' },
  { key: 'unit_weight_lb', label: 'Unit Weight (lb)', placeholder: 'e.g. 7.0', type: 'number' },
];

interface ItemSpecificationsEditorProps {
  itemId: string;
  itemName: string;
  initialSpecs: Record<string, any> | null;
  onSave?: (specs: Record<string, any> | null) => void;
}

export default function ItemSpecificationsEditor({
  itemId,
  itemName,
  initialSpecs,
  onSave,
}: ItemSpecificationsEditorProps) {
  const [specs, setSpecs] = useState<Record<string, any>>(initialSpecs || {});
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>(() => {
    // Extract any fields not in PREDEFINED_FIELDS as custom fields
    const predefinedKeys = new Set(PREDEFINED_FIELDS.map((f) => f.key));
    return Object.entries(initialSpecs || {})
      .filter(([k]) => !predefinedKeys.has(k))
      .map(([key, value]) => ({ key, value: String(value) }));
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateField(key: string, value: string) {
    setSpecs((prev) => {
      const next = { ...prev };
      if (value === '') {
        delete next[key];
      } else {
        // Store numbers as numbers
        const field = PREDEFINED_FIELDS.find((f) => f.key === key);
        next[key] = field?.type === 'number' ? parseFloat(value) || value : value;
      }
      return next;
    });
    setSaved(false);
  }

  function addCustomField() {
    setCustomFields((prev) => [...prev, { key: '', value: '' }]);
    setSaved(false);
  }

  function updateCustomField(index: number, key: string, value: string) {
    setCustomFields((prev) => {
      const next = [...prev];
      next[index] = { key, value };
      return next;
    });
    setSaved(false);
  }

  function removeCustomField(index: number) {
    const field = customFields[index];
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
    if (field.key) {
      setSpecs((prev) => {
        const next = { ...prev };
        delete next[field.key];
        return next;
      });
    }
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);

    // Merge custom fields into specs
    const merged = { ...specs };
    for (const cf of customFields) {
      if (cf.key.trim()) {
        merged[cf.key.trim()] = cf.value;
      }
    }

    // Remove empty values
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v !== '' && v !== null && v !== undefined) {
        cleaned[k] = v;
      }
    }

    const finalSpecs = Object.keys(cleaned).length > 0 ? cleaned : null;

    try {
      const res = await fetch(`/api/items/${itemId}/specifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specifications: finalSpecs }),
      });

      if (res.ok) {
        setSaved(true);
        onSave?.(finalSpecs);
      }
    } catch {
      // Silent fail for now
    }

    setSaving(false);
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm">Item Specifications</h3>
          <p className="text-xs text-muted-foreground">
            Canonical specs enforced during invoice intake
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </Button>
      </div>

      <div className="space-y-3">
        {PREDEFINED_FIELDS.map((field) => (
          <div key={field.key} className="grid grid-cols-[140px_1fr] gap-2 items-center">
            <label className="text-sm text-muted-foreground">{field.label}</label>
            <input
              type={field.type || 'text'}
              step={field.type === 'number' ? '0.1' : undefined}
              className="border rounded px-2 py-1.5 text-sm w-full"
              placeholder={field.placeholder}
              value={specs[field.key] ?? ''}
              onChange={(e) => updateField(field.key, e.target.value)}
            />
          </div>
        ))}

        {customFields.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <p className="text-xs text-muted-foreground mb-2">Custom Specifications</p>
            {customFields.map((cf, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_32px] gap-2 items-center mb-2">
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm"
                  placeholder="Field name"
                  value={cf.key}
                  onChange={(e) => updateCustomField(i, e.target.value, cf.value)}
                />
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm"
                  placeholder="Value"
                  value={cf.value}
                  onChange={(e) => updateCustomField(i, cf.key, e.target.value)}
                />
                <button
                  onClick={() => removeCustomField(i)}
                  className="p-1.5 text-muted-foreground hover:text-keva-error"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={addCustomField}
          className="text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Custom Spec
        </Button>
      </div>
    </Card>
  );
}
