'use client';

import type { OnboardFormData } from '../page';

interface Props {
  data: OnboardFormData;
  onChange: (partial: Partial<OnboardFormData>) => void;
}

const WEEKDAYS = [
  { iso: 0, label: 'Monday' },
  { iso: 1, label: 'Tuesday' },
  { iso: 2, label: 'Wednesday' },
  { iso: 3, label: 'Thursday' },
  { iso: 4, label: 'Friday' },
  { iso: 5, label: 'Saturday' },
  { iso: 6, label: 'Sunday' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`,
}));

export default function StepSchedule({ data, onChange }: Props) {
  const toggleDay = (isoDay: number) => {
    const current = data.closedWeekdays;
    const next = current.includes(isoDay)
      ? current.filter((d) => d !== isoDay)
      : [...current, isoDay].sort();
    onChange({ closedWeekdays: next });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Operating Schedule</h2>

      {/* Service Hours */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Service Hours</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Start
            </label>
            <select
              value={data.serviceStartHour}
              onChange={(e) => onChange({ serviceStartHour: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service End
            </label>
            <select
              value={data.serviceEndHour}
              onChange={(e) => onChange({ serviceEndHour: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Controls when live sales polling runs. End times past midnight (e.g. 2 AM) are supported.
        </p>
      </div>

      {/* Dark Days */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Closed Days (Dark Days)
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.iso}
              className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer transition-colors ${
                data.closedWeekdays.includes(day.iso)
                  ? 'border-red-300 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={data.closedWeekdays.includes(day.iso)}
                onChange={() => toggleDay(day.iso)}
                className="text-red-600 rounded"
              />
              <span className="text-sm">{day.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Checked days are CLOSED. Forecaster will exclude these from training data.
        </p>
      </div>

      {/* Staffing Targets */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Staffing Targets</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Covers per Server
            </label>
            <input
              type="number"
              step="0.5"
              value={data.coversPerServer}
              onChange={(e) => onChange({ coversPerServer: parseFloat(e.target.value) || 16 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Target covers per server (default: 16)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Covers per Bartender
            </label>
            <input
              type="number"
              step="0.5"
              value={data.coversPerBartender}
              onChange={(e) => onChange({ coversPerBartender: parseFloat(e.target.value) || 30 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Target covers per bartender (default: 30)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
