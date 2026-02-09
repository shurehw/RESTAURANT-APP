'use client';

import { useState } from 'react';

export function CompSettingsForm({ settings, onSave, loading }: any) {
  const [formData, setFormData] = useState({
    high_value_comp_threshold: settings.high_value_comp_threshold || 200,
    daily_comp_pct_warning: settings.daily_comp_pct_warning || 2,
    daily_comp_pct_critical: settings.daily_comp_pct_critical || 3,
    server_max_comp_amount: settings.server_max_comp_amount || 50,
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block mb-2">High Value Threshold ($)</label>
          <input
            type="number"
            value={formData.high_value_comp_threshold}
            onChange={(e) => setFormData({ ...formData, high_value_comp_threshold: +e.target.value })}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-2">Server Max Amount ($)</label>
          <input
            type="number"
            value={formData.server_max_comp_amount}
            onChange={(e) => setFormData({ ...formData, server_max_comp_amount: +e.target.value })}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
      </div>
      <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
        {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
}
