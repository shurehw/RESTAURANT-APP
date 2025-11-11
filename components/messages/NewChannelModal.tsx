'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Users } from 'lucide-react';

export function NewChannelModal({
  venueId,
  employeeId,
  onClose,
  onCreated,
}: {
  venueId: string;
  employeeId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState('group');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [venueId]);

  const loadEmployees = async () => {
    try {
      const response = await fetch(`/api/employees?venue_id=${venueId}`);
      const data = await response.json();
      setEmployees(data.employees || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);

    try {
      const response = await fetch('/api/messages/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          name,
          description,
          channel_type: channelType,
          created_by: employeeId,
          member_ids: [employeeId, ...selectedMembers],
        }),
      });

      const result = await response.json();

      if (result.success) {
        onCreated();
      } else {
        alert('Failed to create channel');
      }
    } catch (error) {
      console.error('Error creating channel:', error);
      alert('Error creating channel');
    } finally {
      setCreating(false);
    }
  };

  const toggleMember = (empId: string) => {
    if (selectedMembers.includes(empId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== empId));
    } else {
      setSelectedMembers([...selectedMembers, empId]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-opsos-sage-600" />
            <h2 className="text-xl font-bold">Create New Channel</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Channel Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Channel Type
            </label>
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="group">Group Channel</option>
              <option value="department">Department Channel</option>
              <option value="shift">Shift Channel</option>
            </select>
          </div>

          {/* Channel Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Channel Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekend Team, Morning Crew"
              className="w-full p-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel for?"
              rows={2}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Member Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add Members ({selectedMembers.length} selected)
            </label>
            <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto">
              {employees
                .filter((emp) => emp.id !== employeeId)
                .map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(emp.id)}
                      onChange={() => toggleMember(emp.id)}
                      className="w-4 h-4"
                    />
                    <span>
                      {emp.first_name} {emp.last_name}
                    </span>
                  </label>
                ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={!name.trim() || creating}
              className="flex-1 bg-opsos-sage-600 hover:bg-opsos-sage-700"
            >
              {creating ? 'Creating...' : 'Create Channel'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
