'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, RefreshCw, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

interface EmployeePin {
  id: string;
  employee_id: string;
  employee: {
    first_name: string;
    last_name: string;
    email: string;
  };
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_used_at: string | null;
  is_locked: boolean;
}

// TODO: Get from auth when implemented
const DEMO_VENUE_ID = '00000000-0000-0000-0000-000000000001';

export default function PinManagementPage() {
  const [pins, setPins] = useState<EmployeePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPins, setNewPins] = useState<Record<string, string>>({});

  useEffect(() => {
    loadPins();
  }, []);

  const loadPins = async () => {
    try {
      const response = await fetch(`/api/employees/pins?venue_id=${DEMO_VENUE_ID}`);
      const data = await response.json();

      if (data.success) {
        setPins(data.pins || []);
      }
    } catch (error) {
      console.error('Error loading PINs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async (employeeId: string) => {
    if (!confirm('Generate a new PIN for this employee?')) return;

    setResetting(employeeId);

    try {
      const response = await fetch('/api/employees/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          venue_id: DEMO_VENUE_ID,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Show the new PIN temporarily
        setNewPins({ ...newPins, [employeeId]: result.pin });
        setTimeout(() => {
          setNewPins((prev) => {
            const updated = { ...prev };
            delete updated[employeeId];
            return updated;
          });
        }, 30000); // Hide after 30 seconds

        loadPins();
      } else {
        alert('Failed to reset PIN');
      }
    } catch (error) {
      console.error('Error resetting PIN:', error);
      alert('Error resetting PIN');
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">PIN Management</h1>
        <p className="text-gray-600 mt-2">
          Manage employee PIN codes for kiosk time clock
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total PINs</p>
              <p className="text-2xl font-bold">{pins.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold">
                {pins.filter((p) => p.is_active && !p.is_locked).length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Locked</p>
              <p className="text-2xl font-bold">
                {pins.filter((p) => p.is_locked).length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Failed Attempts</p>
              <p className="text-2xl font-bold">
                {pins.reduce((sum, p) => sum + p.failed_attempts, 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* PIN List */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Employee PINs</h2>

        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading PINs...</p>
        ) : pins.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No employee PINs found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Failed Attempts
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Last Used
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    PIN
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pins.map((pin) => (
                  <tr key={pin.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">
                          {pin.employee.first_name} {pin.employee.last_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {pin.employee.email}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {pin.is_locked ? (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Locked
                        </Badge>
                      ) : pin.is_active ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pin.failed_attempts > 0 ? (
                        <Badge variant="outline" className="text-amber-700">
                          {pin.failed_attempts}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pin.last_used_at ? (
                        <span className="text-sm text-gray-600">
                          {new Date(pin.last_used_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {newPins[pin.employee_id] ? (
                        <div className="flex items-center gap-2">
                          <code className="px-3 py-1 bg-green-100 text-green-800 rounded font-mono text-lg">
                            {newPins[pin.employee_id]}
                          </code>
                          <span className="text-xs text-gray-500">
                            (New - write this down!)
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">••••</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        onClick={() => handleResetPin(pin.employee_id)}
                        disabled={resetting === pin.employee_id}
                        size="sm"
                        variant="outline"
                      >
                        <RefreshCw
                          className={`w-4 h-4 mr-1 ${
                            resetting === pin.employee_id ? 'animate-spin' : ''
                          }`}
                        />
                        Reset PIN
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Security Notes:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>PINs are automatically generated as unique 4-digit codes</li>
              <li>Employees are locked out after 3 failed attempts</li>
              <li>Lockouts last 15 minutes by default</li>
              <li>New PINs are only shown once - make sure to share them securely</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
