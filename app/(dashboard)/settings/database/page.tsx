/**
 * Customer Database Settings
 * Configure external PostgreSQL database connection
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, TestTube, Trash2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function DatabaseSettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [form, setForm] = useState({
    db_host: '',
    db_port: 5432,
    db_name: '',
    db_user: '',
    db_password: '',
    db_ssl: true,
    db_ssl_mode: 'require',
    pool_min: 2,
    pool_max: 10,
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/admin/customer-databases');
      const data = await response.json();
      if (data.database) {
        setConfig(data.database);
        setForm({
          db_host: data.database.db_host,
          db_port: data.database.db_port,
          db_name: data.database.db_name,
          db_user: data.database.db_user,
          db_password: '', // Never show password
          db_ssl: data.database.db_ssl,
          db_ssl_mode: data.database.db_ssl_mode,
          pool_min: data.database.pool_min,
          pool_max: data.database.pool_max,
        });
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);

    try {
      const method = config ? 'PATCH' : 'POST';
      const response = await fetch('/api/admin/customer-databases', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (response.ok) {
        setConfig(data.database);
        setTestResult(data.test_result);
        alert('Database configuration saved!');
      } else {
        alert(`Error: ${data.error || 'Failed to save'}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to remove the custom database configuration? This will revert to using Supabase.')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/customer-databases', {
        method: 'DELETE',
      });

      if (response.ok) {
        setConfig(null);
        setForm({
          db_host: '',
          db_port: 5432,
          db_name: '',
          db_user: '',
          db_password: '',
          db_ssl: true,
          db_ssl_mode: 'require',
          pool_min: 2,
          pool_max: 10,
        });
        alert('Database configuration removed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete configuration');
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Database Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure external PostgreSQL database connection (Enterprise feature)
        </p>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">Custom Database Connection</p>
              <p>
                By default, OpsOS uses Supabase for data storage. Enterprise customers can configure
                their own PostgreSQL database. Your database must use the OpsOS schema.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Status */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {config.last_connection_status === 'success' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-700">Connected successfully</span>
                  {config.last_connection_test && (
                    <span className="text-xs text-gray-500 ml-2">
                      Last tested: {new Date(config.last_connection_test).toLocaleString()}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm text-red-700">
                    {config.connection_error || 'Connection failed'}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Database Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Host *
              </label>
              <input
                type="text"
                value={form.db_host}
                onChange={(e) => setForm({ ...form, db_host: e.target.value })}
                placeholder="postgres.example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Port
              </label>
              <input
                type="number"
                value={form.db_port}
                onChange={(e) => setForm({ ...form, db_port: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Database Name *
            </label>
            <input
              type="text"
              value={form.db_name}
              onChange={(e) => setForm({ ...form, db_name: e.target.value })}
              placeholder="opsos_production"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                value={form.db_user}
                onChange={(e) => setForm({ ...form, db_user: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password * {config && <span className="text-xs text-gray-500">(leave blank to keep current)</span>}
              </label>
              <input
                type="password"
                value={form.db_password}
                onChange={(e) => setForm({ ...form, db_password: e.target.value })}
                placeholder={config ? '••••••••' : ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SSL Mode
              </label>
              <select
                value={form.db_ssl_mode}
                onChange={(e) => setForm({ ...form, db_ssl_mode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="disable">Disable</option>
                <option value="allow">Allow</option>
                <option value="prefer">Prefer</option>
                <option value="require">Require</option>
                <option value="verify-ca">Verify CA</option>
                <option value="verify-full">Verify Full</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={form.db_ssl}
                onChange={(e) => setForm({ ...form, db_ssl: e.target.checked })}
                className="rounded"
              />
              <label className="text-sm text-gray-700">Enable SSL</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pool Min
              </label>
              <input
                type="number"
                value={form.pool_min}
                onChange={(e) => setForm({ ...form, pool_min: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pool Max
              </label>
              <input
                type="number"
                value={form.pool_max}
                onChange={(e) => setForm({ ...form, pool_max: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Result */}
      {testResult && (
        <Card className={testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-green-700">
                    Connection successful! Latency: {testResult.latency}ms
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm text-red-700">
                    Connection failed: {testResult.error}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || !form.db_host || !form.db_name || !form.db_user || (!form.db_password && !config)}
          className="bg-brass hover:bg-brass/90"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : config ? 'Update Configuration' : 'Save Configuration'}
        </Button>

        {config && (
          <Button
            onClick={handleDelete}
            variant="destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Remove Configuration
          </Button>
        )}
      </div>
    </div>
  );
}
