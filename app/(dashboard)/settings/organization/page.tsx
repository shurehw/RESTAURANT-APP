'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Calendar,
  Bell,
  Save,
} from 'lucide-react';

interface OrganizationSettings {
  // Labor
  enable_auto_scheduling: boolean;
  enable_labor_forecasting: boolean;
  target_labor_percentage: number;

  // Notifications
  notify_slack: boolean;
  slack_webhook_url: string;
  notify_email: boolean;
  daily_briefing_enabled: boolean;
  daily_briefing_time: string;
}

export default function OrganizationSettingsPage() {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/organization');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);

    try {
      const response = await fetch('/api/settings/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const result = await response.json();

      if (result.success) {
        alert('Settings saved successfully');
        setHasChanges(false);
      } else {
        alert(result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof OrganizationSettings>(
    key: K,
    value: OrganizationSettings[K]
  ) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : null));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-8">
        <p>Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Organization Settings
            </h1>
            <p className="text-gray-600 mt-2">
              Configure system-wide settings for your organization
            </p>
          </div>
          {hasChanges && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Labor Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-6 h-6 text-opsos-sage-600" />
            <h2 className="text-xl font-semibold">Labor Settings</h2>
          </div>

          <div className="space-y-4">
            <SettingToggle
              icon={<Calendar className="w-5 h-5" />}
              label="Enable Auto-Scheduling"
              description="Use AI to automatically generate schedule recommendations"
              checked={settings.enable_auto_scheduling}
              onChange={(checked) =>
                updateSetting('enable_auto_scheduling', checked)
              }
            />

            <SettingToggle
              icon={<Settings className="w-5 h-5" />}
              label="Enable Labor Forecasting"
              description="Use ML to predict staffing needs based on forecasted covers"
              checked={settings.enable_labor_forecasting}
              onChange={(checked) =>
                updateSetting('enable_labor_forecasting', checked)
              }
            />

            <div className="ml-8 mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Labor Percentage
              </label>
              <input
                type="number"
                value={settings.target_labor_percentage}
                onChange={(e) =>
                  updateSetting('target_labor_percentage', parseFloat(e.target.value))
                }
                min={15}
                max={50}
                step={0.5}
                className="w-32 p-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                Goal labor cost as % of revenue (typically 25-30%)
              </p>
            </div>
          </div>
        </Card>

        {/* Notification Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-6 h-6 text-opsos-sage-600" />
            <h2 className="text-xl font-semibold">Notification Settings</h2>
          </div>

          <div className="space-y-4">
            <SettingToggle
              icon={<Bell className="w-5 h-5" />}
              label="Email Notifications"
              description="Send email notifications for important events"
              checked={settings.notify_email}
              onChange={(checked) => updateSetting('notify_email', checked)}
            />

            <SettingToggle
              icon={<Bell className="w-5 h-5" />}
              label="Daily Forecast Briefing"
              description="Receive automated daily forecast summary at 9am"
              checked={settings.daily_briefing_enabled}
              onChange={(checked) =>
                updateSetting('daily_briefing_enabled', checked)
              }
            />

            <SettingToggle
              icon={<Bell className="w-5 h-5" />}
              label="Slack Notifications"
              description="Send notifications to Slack workspace"
              checked={settings.notify_slack}
              onChange={(checked) => updateSetting('notify_slack', checked)}
            />

            {settings.notify_slack && (
              <div className="ml-8 mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  value={settings.slack_webhook_url || ''}
                  onChange={(e) =>
                    updateSetting('slack_webhook_url', e.target.value)
                  }
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full max-w-md p-2 border border-gray-300 rounded-md"
                />
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex items-start gap-3">
        <div className="text-gray-500 mt-0.5">{icon}</div>
        <div>
          <h3 className="font-medium text-gray-900">{label}</h3>
          <p className="text-sm text-gray-600 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-opsos-sage-500 focus:ring-offset-2 ${
          checked ? 'bg-opsos-sage-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
