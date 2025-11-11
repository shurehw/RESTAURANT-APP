'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Save, Copy, Calendar, Clock } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  template_type: string;
  use_count: number;
  last_used_at: string;
  created_at: string;
}

export function ScheduleTemplatesModal({
  venueId,
  onClose,
  onApplyTemplate,
  onSaveAsTemplate,
  currentScheduleId,
  weekStartDate,
}: {
  venueId: string;
  onClose: () => void;
  onApplyTemplate: (templateId: string) => void;
  onSaveAsTemplate: () => void;
  currentScheduleId?: string;
  weekStartDate?: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'apply' | 'save'>('apply');

  // Save template state
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateType, setTemplateType] = useState('weekly');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [venueId]);

  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/schedule/templates?venue_id=${venueId}`);
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !currentScheduleId) return;

    setSaving(true);

    try {
      // First, get current schedule data
      const scheduleResponse = await fetch(
        `/api/schedule/${currentScheduleId}`
      );
      const scheduleData = await scheduleResponse.json();

      if (!scheduleData.success) {
        alert('Failed to load schedule data');
        return;
      }

      // Transform shifts to template format
      const templateData = scheduleData.shifts.map((shift: any) => ({
        employee_id: shift.employee_id,
        position_id: shift.position_id,
        day_of_week: new Date(shift.scheduled_start).getDay(),
        start_time: new Date(shift.scheduled_start).toTimeString().slice(0, 5),
        end_time: new Date(shift.scheduled_end).toTimeString().slice(0, 5),
        hours: shift.scheduled_hours,
        shift_type: shift.shift_type,
      }));

      // Save template
      const response = await fetch('/api/schedule/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          name: templateName,
          description: templateDescription,
          template_type: templateType,
          template_data: templateData,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Template saved successfully!');
        setTemplateName('');
        setTemplateDescription('');
        loadTemplates();
        setActiveTab('apply');
      } else {
        alert('Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    if (!currentScheduleId || !weekStartDate) {
      alert('Missing schedule information');
      return;
    }

    if (
      !confirm(
        'This will overwrite the current schedule. Are you sure?'
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/schedule/templates/${templateId}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            week_start_date: weekStartDate,
            schedule_id: currentScheduleId,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        alert(
          `Template applied successfully! Created ${result.shifts_created} shifts.`
        );
        onApplyTemplate(templateId);
        onClose();
      } else {
        alert('Failed to apply template');
      }
    } catch (error) {
      console.error('Error applying template:', error);
      alert('Error applying template');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Schedule Templates</h2>
            <p className="text-gray-600 text-sm">
              Save time by reusing common schedules
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b mb-6">
          <button
            onClick={() => setActiveTab('apply')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'apply'
                ? 'border-b-2 border-opsos-sage-600 text-opsos-sage-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Copy className="w-4 h-4 inline mr-2" />
            Apply Template
          </button>
          <button
            onClick={() => setActiveTab('save')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'save'
                ? 'border-b-2 border-opsos-sage-600 text-opsos-sage-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Save className="w-4 h-4 inline mr-2" />
            Save as Template
          </button>
        </div>

        {/* Apply Tab */}
        {activeTab === 'apply' && (
          <div className="space-y-4">
            {loading ? (
              <p className="text-center text-gray-500 py-8">Loading templates...</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No templates saved yet</p>
                <p className="text-sm text-gray-400 mt-2">
                  Create your first template by saving the current schedule
                </p>
              </div>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{template.name}</h3>
                        <Badge className="capitalize">{template.template_type}</Badge>
                        {template.use_count > 0 && (
                          <Badge variant="outline">
                            Used {template.use_count}x
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-gray-600 mb-2">
                          {template.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          <Clock className="w-3 h-3 inline mr-1" />
                          Created {new Date(template.created_at).toLocaleDateString()}
                        </span>
                        {template.last_used_at && (
                          <span>
                            Last used{' '}
                            {new Date(template.last_used_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleApplyTemplate(template.id)}
                      className="bg-opsos-sage-600 hover:bg-opsos-sage-700"
                    >
                      Apply
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Save Tab */}
        {activeTab === 'save' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Name *
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Standard Winter Week"
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="What makes this schedule unique?"
                rows={3}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Type
              </label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="weekly">Weekly (Standard)</option>
                <option value="seasonal">Seasonal</option>
                <option value="event">Special Event</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <Button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim() || saving}
              className="w-full bg-opsos-sage-600 hover:bg-opsos-sage-700"
            >
              {saving ? 'Saving...' : 'Save Current Schedule as Template'}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              This will save the current week's schedule as a reusable template
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
