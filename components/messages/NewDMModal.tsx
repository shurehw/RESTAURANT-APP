'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, MessageCircle, Search } from 'lucide-react';

export function NewDMModal({
  venueId,
  employeeId,
  onClose,
  onCreated,
}: {
  venueId: string;
  employeeId: string;
  onClose: () => void;
  onCreated: (channel: any) => void;
}) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [venueId]);

  const loadEmployees = async () => {
    try {
      const response = await fetch(`/api/employees?venue_id=${venueId}`);
      const data = await response.json();
      setEmployees(
        (data.employees || []).filter((emp: any) => emp.id !== employeeId)
      );
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleStartDM = async (targetEmployeeId: string) => {
    setCreating(true);

    try {
      const response = await fetch('/api/messages/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id_1: employeeId,
          employee_id_2: targetEmployeeId,
          venue_id: venueId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onCreated(result.channel);
      } else {
        alert('Failed to create DM');
      }
    } catch (error) {
      console.error('Error creating DM:', error);
      alert('Error creating DM');
    } finally {
      setCreating(false);
    }
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-opsos-sage-600" />
            <h2 className="text-xl font-bold">New Direct Message</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md"
            autoFocus
          />
        </div>

        {/* Employee List */}
        <div className="flex-1 overflow-y-auto border border-gray-300 rounded-md">
          {filteredEmployees.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchQuery ? 'No employees found' : 'No employees available'}
            </div>
          ) : (
            filteredEmployees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => handleStartDM(emp.id)}
                disabled={creating}
                className="w-full p-4 text-left hover:bg-gray-50 border-b last:border-b-0 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-opsos-sage-100 flex items-center justify-center text-opsos-sage-700 font-semibold">
                    {emp.first_name[0]}
                    {emp.last_name[0]}
                  </div>
                  <div>
                    <div className="font-semibold">
                      {emp.first_name} {emp.last_name}
                    </div>
                    {emp.email && (
                      <div className="text-sm text-gray-500">{emp.email}</div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <Button
          variant="outline"
          onClick={onClose}
          className="mt-4"
        >
          Cancel
        </Button>
      </Card>
    </div>
  );
}
