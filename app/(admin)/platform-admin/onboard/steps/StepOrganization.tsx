'use client';

import { useState, useEffect } from 'react';
import type { OnboardFormData } from '../page';

interface Props {
  data: OnboardFormData;
  onChange: (partial: Partial<OnboardFormData>) => void;
}

interface Org {
  id: string;
  name: string;
  slug: string;
}

export default function StepOrganization({ data, onChange }: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data.orgMode === 'existing') {
      setLoading(true);
      fetch('/api/admin/organizations')
        .then((r) => r.json())
        .then((d) => setOrgs(d.organizations || []))
        .catch(() => setOrgs([]))
        .finally(() => setLoading(false));
    }
  }, [data.orgMode]);

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    onChange({ orgName: name, orgSlug: slug });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Organization</h2>

      {/* Mode Toggle */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={data.orgMode === 'new'}
            onChange={() => onChange({ orgMode: 'new', orgId: '' })}
            className="text-blue-600"
          />
          <span className="text-sm font-medium">Create new organization</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={data.orgMode === 'existing'}
            onChange={() => onChange({ orgMode: 'existing' })}
            className="text-blue-600"
          />
          <span className="text-sm font-medium">Use existing organization</span>
        </label>
      </div>

      {data.orgMode === 'new' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                value={data.orgName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. Mistral Restaurant Group"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug *
              </label>
              <input
                type="text"
                value={data.orgSlug}
                onChange={(e) =>
                  onChange({ orgSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="e.g. mistral"
              />
              <p className="text-xs text-gray-500 mt-1">URL-safe identifier</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select
                value={data.orgPlan}
                onChange={(e) => onChange({ orgPlan: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select
                value={data.orgTimezone}
                onChange={(e) => onChange({ orgTimezone: e.target.value, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
                <option value="America/Chicago">Central (Chicago)</option>
                <option value="America/New_York">Eastern (New York)</option>
                <option value="America/Denver">Mountain (Denver)</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Organization *
          </label>
          {loading ? (
            <p className="text-sm text-gray-500">Loading organizations...</p>
          ) : (
            <select
              value={data.orgId}
              onChange={(e) => onChange({ orgId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select --</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.slug})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
