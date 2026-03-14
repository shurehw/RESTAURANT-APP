'use client';

import { useState } from 'react';
import type { OnboardFormData } from '../page';

interface Props {
  data: OnboardFormData;
  onChange: (partial: Partial<OnboardFormData>) => void;
}

const POS_OPTIONS = [
  { value: 'toast', label: 'Toast', description: 'Direct Toast API integration' },
  { value: 'upserve', label: 'Upserve / TipSee', description: 'Via TipSee middleware (tipsee_checks)' },
  { value: 'simphony', label: 'Oracle Simphony', description: 'Via Simphony BI API' },
  { value: 'manual', label: 'Manual / CSV', description: 'Upload data manually (no live polling)' },
] as const;

export default function StepPosConfig({ data, onChange }: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const handleTestToast = async () => {
    if (!data.toastGuid || !data.toastClientId || !data.toastClientSecret) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/toast-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_guid: data.toastGuid,
          client_id: data.toastClientId,
          client_secret: data.toastClientSecret,
        }),
      });
      const result = await res.json();
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">POS Configuration</h2>

      {/* POS Type Selection */}
      <div className="space-y-3">
        {POS_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
              data.posType === opt.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              checked={data.posType === opt.value}
              onChange={() => onChange({ posType: opt.value })}
              className="mt-0.5 text-blue-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">{opt.label}</span>
              <p className="text-xs text-gray-500">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Toast Config */}
      {data.posType === 'toast' && (
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700">Toast API Credentials</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Restaurant GUID *
            </label>
            <input
              type="text"
              value={data.toastGuid}
              onChange={(e) => onChange({ toastGuid: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="e.g. 729400"
            />
            <p className="text-xs text-gray-500 mt-1">
              Toast-Restaurant-External-ID header value
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client ID *
            </label>
            <input
              type="text"
              value={data.toastClientId}
              onChange={(e) => onChange({ toastClientId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="OAuth2 client ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Secret *
            </label>
            <input
              type="password"
              value={data.toastClientSecret}
              onChange={(e) => onChange({ toastClientSecret: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="OAuth2 client secret"
            />
            <p className="text-xs text-gray-500 mt-1">
              Encrypted at rest via AES-256-GCM in toast_venue_config
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTestToast}
              disabled={testing || !data.toastGuid || !data.toastClientId || !data.toastClientSecret}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {testResult && (
              <span className={`text-sm ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.ok ? 'Connection successful' : `Failed: ${testResult.error}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Upserve / TipSee Config */}
      {data.posType === 'upserve' && (
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700">TipSee Location</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              TipSee Location UUID *
            </label>
            <input
              type="text"
              value={data.tipseeLocationUuid}
              onChange={(e) => onChange({ tipseeLocationUuid: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <p className="text-xs text-gray-500 mt-1">
              UUID from TipSee general_locations table. Run discover-tipsee-locations to find it.
            </p>
          </div>
        </div>
      )}

      {/* Simphony Config */}
      {data.posType === 'simphony' && (
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700">Simphony BI Integration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location Reference *
              </label>
              <input
                type="text"
                value={data.simphonyLocRef}
                onChange={(e) => onChange({ simphonyLocRef: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="loc_ref"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Org Identifier *
              </label>
              <input
                type="text"
                value={data.simphonyOrgIdentifier}
                onChange={(e) => onChange({ simphonyOrgIdentifier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="org_identifier"
              />
            </div>
          </div>
        </div>
      )}

      {/* Manual */}
      {data.posType === 'manual' && (
        <div className="pt-4 border-t">
          <p className="text-sm text-gray-600">
            No POS integration will be configured. Sales data can be uploaded manually via CSV
            or entered through the admin interface. Live polling will not be available.
          </p>
        </div>
      )}
    </div>
  );
}
