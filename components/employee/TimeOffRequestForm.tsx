'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface TimeOffRequest {
  id: string;
  request_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  denial_reason?: string;
}

export function TimeOffRequestForm({ employee }: { employee: any }) {
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [requestType, setRequestType] = useState('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (employee) {
      loadRequests();
    }
  }, [employee]);

  const loadRequests = async () => {
    if (!employee) return;

    try {
      const response = await fetch(
        `/api/employee/time-off?employee_id=${employee.id}`
      );
      const data = await response.json();
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !startDate || !endDate) return;

    setLoading(true);

    try {
      const response = await fetch('/api/employee/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employee.id,
          venue_id: employee.venue_id,
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim() || null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Request submitted successfully');
        setShowForm(false);
        setStartDate('');
        setEndDate('');
        setReason('');
        loadRequests();
      } else {
        alert(result.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Error submitting request');
    } finally {
      setLoading(false);
    }
  };

  if (showForm) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Request Time Off</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Request Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                required
              >
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="personal">Personal</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full p-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split('T')[0]}
                className="w-full p-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Brief explanation..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Submitting...' : 'Submit Request'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setStartDate('');
                  setEndDate('');
                  setReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* New Request Button */}
      <Button
        onClick={() => setShowForm(true)}
        className="w-full bg-opsos-sage-600 hover:bg-opsos-sage-700"
      >
        <Calendar className="w-5 h-5 mr-2" />
        New Time Off Request
      </Button>

      {/* Requests List */}
      <div className="space-y-3">
        {requests.length === 0 ? (
          <Card className="p-6 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Requests</h3>
            <p className="text-gray-600 text-sm">
              You haven't submitted any time-off requests yet
            </p>
          </Card>
        ) : (
          requests.map((request) => (
            <Card key={request.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold capitalize">
                      {request.request_type}
                    </h3>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(request.start_date).toLocaleDateString()} -{' '}
                    {new Date(request.end_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {request.total_days} day{request.total_days !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {request.reason && (
                <p className="text-sm text-gray-700 mt-2 mb-2">
                  "{request.reason}"
                </p>
              )}

              {request.status === 'denied' && request.denial_reason && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">
                    <strong>Denied:</strong> {request.denial_reason}
                  </p>
                </div>
              )}

              {request.reviewed_by_name && (
                <p className="text-xs text-gray-500 mt-2">
                  {request.status === 'approved' ? 'Approved' : 'Reviewed'} by{' '}
                  {request.reviewed_by_name} on{' '}
                  {new Date(request.reviewed_at!).toLocaleDateString()}
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: {
      color: 'bg-amber-100 text-amber-800',
      icon: <Clock className="w-3 h-3" />,
    },
    approved: {
      color: 'bg-green-100 text-green-800',
      icon: <CheckCircle className="w-3 h-3" />,
    },
    denied: {
      color: 'bg-red-100 text-red-800',
      icon: <XCircle className="w-3 h-3" />,
    },
  };

  const { color, icon } = config[status as keyof typeof config];

  return (
    <Badge className={`${color} flex items-center gap-1`}>
      {icon}
      <span className="capitalize">{status}</span>
    </Badge>
  );
}
