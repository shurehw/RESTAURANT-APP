'use client';

import { useState } from 'react';

interface CompReason {
  name: string;
  requires_manager_approval: boolean;
  max_amount: number | null;
}

export function ApprovedReasonsManager({ reasons, onSave, loading }: any) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [localReasons, setLocalReasons] = useState<CompReason[]>(reasons);
  const [formData, setFormData] = useState<CompReason>({
    name: '',
    requires_manager_approval: false,
    max_amount: null,
  });

  const startEdit = (index: number) => {
    setFormData(localReasons[index]);
    setEditingIndex(index);
    setIsAdding(false);
  };

  const startAdd = () => {
    setFormData({ name: '', requires_manager_approval: false, max_amount: null });
    setIsAdding(true);
    setEditingIndex(null);
  };

  const handleSave = () => {
    let updated = [...localReasons];

    if (isAdding) {
      updated.push(formData);
    } else if (editingIndex !== null) {
      updated[editingIndex] = formData;
    }

    setLocalReasons(updated);
    onSave(updated);
    setIsAdding(false);
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    if (confirm('Delete this reason?')) {
      const updated = localReasons.filter((_, i) => i !== index);
      setLocalReasons(updated);
      onSave(updated);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">Approved Comp Reasons</h3>
        <button
          onClick={startAdd}
          disabled={loading || isAdding || editingIndex !== null}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          + Add Reason
        </button>
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingIndex !== null) && (
        <div className="p-4 border-2 border-blue-500 rounded-lg bg-blue-50">
          <h4 className="font-medium mb-3">{isAdding ? 'Add New Reason' : 'Edit Reason'}</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Reason Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="e.g., Guest Recovery"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Max Amount ($)</label>
                <input
                  type="number"
                  value={formData.max_amount || ''}
                  onChange={(e) => setFormData({ ...formData, max_amount: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Leave empty for no limit"
                />
              </div>

              <div>
                <label className="flex items-center mt-6">
                  <input
                    type="checkbox"
                    checked={formData.requires_manager_approval}
                    onChange={(e) => setFormData({ ...formData, requires_manager_approval: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Requires Manager Approval</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={!formData.name.trim() || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reasons List */}
      <div className="space-y-2">
        {localReasons.map((reason: CompReason, i: number) => (
          <div
            key={i}
            className="p-3 border rounded flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex-1">
              <div className="font-medium">{reason.name}</div>
              <div className="text-sm text-gray-600 space-x-3">
                {reason.max_amount !== null && (
                  <span>Max: ${reason.max_amount}</span>
                )}
                {reason.requires_manager_approval && (
                  <span className="text-orange-600">⚠ Manager approval required</span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => startEdit(i)}
                disabled={loading || isAdding || editingIndex !== null}
                className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(i)}
                disabled={loading || isAdding || editingIndex !== null}
                className="px-3 py-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
