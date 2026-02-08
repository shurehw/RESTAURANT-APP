'use client';

import { useState, useEffect } from 'react';
import { CompSettingsForm } from './CompSettingsForm';
import { LogoUploader } from './LogoUploader';
import { ApprovedReasonsManager } from './ApprovedReasonsManager';
import { SOPPreview } from './SOPPreview';
import { VersionHistory } from './VersionHistory';
import { ImportExport } from './ImportExport';

interface Organization {
  id: string;
  name: string;
  logo_url?: string | null;
}

interface Props {
  organizations: Organization[];
}

export function CompSettingsManager({ organizations }: Props) {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(
    organizations[0] || null
  );
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'reasons' | 'logo' | 'sop' | 'history' | 'import'>('settings');

  useEffect(() => {
    if (selectedOrg) {
      loadSettings(selectedOrg.id);
    }
  }, [selectedOrg]);

  async function loadSettings(orgId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/comp/settings?org_id=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(updates: any) {
    if (!selectedOrg) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/comp/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: selectedOrg.id,
          updates,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
        alert('Settings updated successfully!');
      } else {
        const error = await res.json();
        alert(`Failed to update settings: ${error.error}`);
      }
    } catch (error) {
      alert('Failed to update settings');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (organizations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No organizations found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization Selector */}
      <div className="flex items-center gap-4">
        <label className="font-medium">Organization:</label>
        <select
          value={selectedOrg?.id || ''}
          onChange={(e) => {
            const org = organizations.find((o) => o.id === e.target.value);
            setSelectedOrg(org || null);
          }}
          className="px-4 py-2 border rounded-lg"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          {[
            { id: 'settings', label: '⚙️ Thresholds' },
            { id: 'reasons', label: '✅ Approved Reasons' },
            { id: 'history', label: '📜 Version History' },
            { id: 'import', label: '💾 Import/Export' },
            { id: 'logo', label: '🎨 Logo' },
            { id: 'sop', label: '📄 Generate SOP' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="py-6">
        {loading && !settings ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        ) : !settings ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No settings found for this organization</p>
          </div>
        ) : (
          <>
            {activeTab === 'settings' && (
              <CompSettingsForm
                settings={settings}
                onSave={handleSaveSettings}
                loading={loading}
              />
            )}
            {activeTab === 'reasons' && (
              <ApprovedReasonsManager
                reasons={settings.approved_reasons || []}
                onSave={(reasons) => handleSaveSettings({ approved_reasons: reasons })}
                loading={loading}
              />
            )}
            {activeTab === 'logo' && selectedOrg && (
              <LogoUploader
                orgId={selectedOrg.id}
                currentLogoUrl={selectedOrg.logo_url}
                onUploadComplete={() => window.location.reload()}
              />
            )}
            {activeTab === 'sop' && selectedOrg && (
              <SOPPreview orgId={selectedOrg.id} orgName={selectedOrg.name} />
            )}
            {activeTab === 'history' && selectedOrg && (
              <VersionHistory orgId={selectedOrg.id} />
            )}
            {activeTab === 'import' && (
              <ImportExport settings={settings} onImport={handleSaveSettings} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
