'use client';

import { useState, useEffect } from 'react';

export function VersionHistory({ orgId }: { orgId: string }) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVersions();
  }, [orgId]);

  async function loadVersions() {
    setLoading(true);
    try {
      // Query all versions from database
      const res = await fetch(`/api/comp/settings/versions?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading version history...</div>;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Version History</h3>
      <div className="space-y-3">
        {versions.map((v) => (
          <div key={v.version} className="p-4 border rounded hover:bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">Version {v.version}</div>
                <div className="text-sm text-gray-600">
                  Effective: {new Date(v.effective_from).toLocaleString()}
                  {v.effective_to && ` - ${new Date(v.effective_to).toLocaleString()}`}
                </div>
              </div>
              {v.is_active && !v.effective_to && (
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                  Current
                </span>
              )}
            </div>
            <div className="mt-2 text-sm space-y-1">
              <div>High Value: ${v.high_value_comp_threshold}</div>
              <div>Server Max: ${v.server_max_comp_amount}</div>
              <div>Daily Warning: {v.daily_comp_pct_warning}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
