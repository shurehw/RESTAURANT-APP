'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type TemplateVersion = {
  id: string;
  version: number;
  prompt: string;
  quality_fast: Record<string, unknown>;
  quality_premium: Record<string, unknown>;
  notes: string | null;
  created_at: string;
};

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
  current_version: number;
  default_quality_preset: 'fast' | 'premium';
  latest_version: TemplateVersion | null;
  versions: TemplateVersion[];
};

type RenderRow = {
  id: string;
  template_id: string;
  template_version: number;
  quality_preset: 'fast' | 'premium';
  credits_used: number;
  output_image_url: string | null;
  status: string;
  prompt_snapshot: string;
  settings_snapshot: Record<string, unknown>;
  created_at: string;
};

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export function MockupsAdminPanel() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [qualityPreset, setQualityPreset] = useState<'fast' | 'premium'>('fast');

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newFastJson, setNewFastJson] = useState('{\n  "steps": 20,\n  "resolution": "1024x1024"\n}');
  const [newPremiumJson, setNewPremiumJson] = useState('{\n  "steps": 40,\n  "resolution": "1536x1536"\n}');
  const [newDefaultPreset, setNewDefaultPreset] = useState<'fast' | 'premium'>('fast');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, renRes] = await Promise.all([
        fetch('/api/mockups/templates'),
        fetch('/api/mockups/renders'),
      ]);
      const tplData = await tplRes.json();
      const renData = await renRes.json();

      if (!tplRes.ok) throw new Error(tplData.error || 'Failed to load templates');
      if (!renRes.ok) throw new Error(renData.error || 'Failed to load renders');

      setTemplates(tplData.templates || []);
      setRenders(renData.renders || []);
      if (!selectedTemplateId && (tplData.templates || []).length > 0) {
        setSelectedTemplateId(tplData.templates[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const createTemplate = async () => {
    setMessage(null);
    setError(null);
    try {
      const qualityFast = JSON.parse(newFastJson);
      const qualityPremium = JSON.parse(newPremiumJson);
      const res = await fetch('/api/mockups/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          prompt: newPrompt,
          default_quality_preset: newDefaultPreset,
          quality_fast: qualityFast,
          quality_premium: qualityPremium,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create template');
      setMessage('Template created.');
      setNewName('');
      setNewCategory('');
      setNewPrompt('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    }
  };

  const createRender = async () => {
    if (!selectedTemplateId) return;
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/mockups/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          quality_preset: qualityPreset,
          provider: 'manual',
          provider_model: 'n/a',
          status: 'completed',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create render');
      setMessage(
        `Render logged at template v${data.render.template_version} (${data.render.quality_preset}, ${data.render.credits_used} credits).`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create render');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ledger-black">Mockups Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage template quality presets and preserve versioned snapshots for reproducible rerenders.
        </p>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
      {message && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">{message}</div>}

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Create Template</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Template name"
            className="p-2 border rounded"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category"
            className="p-2 border rounded"
          />
        </div>
        <textarea
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          placeholder="Prompt"
          className="w-full p-2 border rounded min-h-[80px]"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <textarea
            value={newFastJson}
            onChange={(e) => setNewFastJson(e.target.value)}
            className="w-full p-2 border rounded min-h-[120px] font-mono text-xs"
          />
          <textarea
            value={newPremiumJson}
            onChange={(e) => setNewPremiumJson(e.target.value)}
            className="w-full p-2 border rounded min-h-[120px] font-mono text-xs"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={newDefaultPreset}
            onChange={(e) => setNewDefaultPreset(e.target.value as 'fast' | 'premium')}
            className="p-2 border rounded"
          >
            <option value="fast">Default: Fast</option>
            <option value="premium">Default: Premium</option>
          </select>
          <Button onClick={createTemplate} disabled={!newName || !newCategory || !newPrompt}>
            Create Template
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Log Render (Versioned Snapshot)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="p-2 border rounded min-w-[280px]"
          >
            <option value="">Select template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.current_version})
              </option>
            ))}
          </select>
          <select
            value={qualityPreset}
            onChange={(e) => setQualityPreset(e.target.value as 'fast' | 'premium')}
            className="p-2 border rounded"
          >
            <option value="fast">Fast (5 credits)</option>
            <option value="premium">Premium (10 credits)</option>
          </select>
          <Button onClick={createRender} disabled={!selectedTemplateId}>
            Log Render
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Templates</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div key={t.id} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.category}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      v{t.current_version} / default {t.default_quality_preset}
                    </div>
                  </div>
                  {t.latest_version && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer">Latest preset snapshot</summary>
                      <pre className="text-[11px] mt-2 overflow-x-auto bg-gray-50 border rounded p-2">
{`Prompt:
${t.latest_version.prompt}

Fast:
${prettyJson(t.latest_version.quality_fast)}

Premium:
${prettyJson(t.latest_version.quality_premium)}
`}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-3">Recent Renders</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : renders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renders logged yet.</p>
          ) : (
            <div className="space-y-2">
              {renders.map((r) => (
                <div key={r.id} className="border rounded p-2">
                  <div className="text-sm font-medium">
                    Template {r.template_id.slice(0, 8)}... v{r.template_version}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.quality_preset} • {r.credits_used} credits • {new Date(r.created_at).toLocaleString()}
                  </div>
                  <details className="mt-1">
                    <summary className="text-xs cursor-pointer">Snapshot</summary>
                    <pre className="text-[11px] mt-1 overflow-x-auto bg-gray-50 border rounded p-2">
{`Prompt:
${r.prompt_snapshot}

Settings:
${prettyJson(r.settings_snapshot)}
`}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

