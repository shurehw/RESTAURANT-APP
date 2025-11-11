'use client';

/**
 * Employee Mobile App Component
 * Mobile-first employee self-service portal
 */

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Calendar,
  Users,
  Settings,
  LogOut,
  Camera,
  MapPin,
  CheckCircle,
  Coffee,
  CalendarPlus,
  CalendarX,
  Repeat,
} from 'lucide-react';
import { TimeOffRequestForm } from './TimeOffRequestForm';
import { AvailabilityManager } from './AvailabilityManager';
import { ShiftSwapList } from './ShiftSwapList';

type Tab = 'clock' | 'schedule' | 'timeoff' | 'availability' | 'swaps' | 'settings';

export function EmployeeApp() {
  const [activeTab, setActiveTab] = useState<Tab>('clock');
  const [employee, setEmployee] = useState<any>(null); // TODO: Get from auth
  const [clockStatus, setClockStatus] = useState<any>(null);

  // Mock employee - TODO: Get from auth
  useEffect(() => {
    setEmployee({
      id: 'emp-123',
      first_name: 'John',
      last_name: 'Doe',
      venue_id: 'venue-123',
    });
  }, []);

  // Load clock status
  useEffect(() => {
    if (employee) {
      loadClockStatus();
    }
  }, [employee]);

  const loadClockStatus = async () => {
    if (!employee) return;

    try {
      const response = await fetch(
        `/api/timeclock/punch?employee_id=${employee.id}&venue_id=${employee.venue_id}`
      );
      const data = await response.json();
      setClockStatus(data);
    } catch (error) {
      console.error('Error loading clock status:', error);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-opsos-sage-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">OpsOS</h1>
            {employee && (
              <p className="text-sm text-opsos-sage-100">
                {employee.first_name} {employee.last_name}
              </p>
            )}
          </div>
          {clockStatus?.clockedIn && (
            <Badge variant="default" className="bg-green-500 text-white px-3 py-2">
              <Clock className="w-4 h-4 mr-1" />
              {clockStatus.hoursWorked.toFixed(1)}h
            </Badge>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-4">
        {activeTab === 'clock' && (
          <ClockTab
            employee={employee}
            clockStatus={clockStatus}
            onRefresh={loadClockStatus}
          />
        )}
        {activeTab === 'schedule' && <ScheduleTab employee={employee} />}
        {activeTab === 'timeoff' && <TimeOffRequestForm employee={employee} />}
        {activeTab === 'availability' && <AvailabilityManager employee={employee} />}
        {activeTab === 'swaps' && <ShiftSwapList employee={employee} />}
        {activeTab === 'settings' && <SettingsTab employee={employee} />}
      </div>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-gray-200 p-2 shadow-lg">
        <div className="grid grid-cols-5 gap-1">
          <NavButton
            icon={<Clock />}
            label="Clock"
            active={activeTab === 'clock'}
            onClick={() => setActiveTab('clock')}
          />
          <NavButton
            icon={<Calendar />}
            label="Schedule"
            active={activeTab === 'schedule'}
            onClick={() => setActiveTab('schedule')}
          />
          <NavButton
            icon={<CalendarPlus />}
            label="Time Off"
            active={activeTab === 'timeoff'}
            onClick={() => setActiveTab('timeoff')}
          />
          <NavButton
            icon={<CalendarX />}
            label="Availability"
            active={activeTab === 'availability'}
            onClick={() => setActiveTab('availability')}
          />
          <NavButton
            icon={<Repeat />}
            label="Swaps"
            active={activeTab === 'swaps'}
            onClick={() => setActiveTab('swaps')}
          />
        </div>
      </nav>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-colors ${
        active
          ? 'bg-opsos-sage-100 text-opsos-sage-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <div className="w-6 h-6 mb-1">{icon}</div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function ClockTab({
  employee,
  clockStatus,
  onRefresh,
}: {
  employee: any;
  clockStatus: any;
  onRefresh: () => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Get location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(setLocation);
    }
  }, []);

  const handleClockAction = async (action: string) => {
    setCapturing(true);
    await startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('Camera error:', error);
      alert('Camera access required');
      setCapturing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const captureAndSubmit = async (action: string) => {
    if (!videoRef.current || !canvasRef.current || !employee) return;

    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);

    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;

      const formData = new FormData();
      formData.append('employee_id', employee.id);
      formData.append('venue_id', employee.venue_id);
      formData.append('punch_type', action);
      formData.append('photo', blob, 'selfie.jpg');

      if (location) {
        formData.append('latitude', location.coords.latitude.toString());
        formData.append('longitude', location.coords.longitude.toString());
        formData.append('accuracy', location.coords.accuracy.toString());
      }

      formData.append('device_id', navigator.userAgent);

      try {
        const response = await fetch('/api/timeclock/punch', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          alert(result.message);
          stopCamera();
          setCapturing(false);
          onRefresh();
        } else {
          alert(result.error || 'Failed to clock in');
        }
      } catch (error) {
        console.error('Clock error:', error);
        alert('Error submitting');
      }
    }, 'image/jpeg', 0.8);
  };

  if (capturing) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Take Verification Photo</h2>
          <div className="relative bg-black rounded-lg overflow-hidden mb-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-64 object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                const action = clockStatus?.clockedIn ? 'clock_out' : 'clock_in';
                captureAndSubmit(action);
              }}
            >
              <Camera className="w-5 h-5 mr-2" />
              Capture
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                stopCamera();
                setCapturing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Time */}
      <Card className="p-6 text-center">
        <div className="text-4xl font-bold text-gray-900 mb-2">
          {new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
        <div className="text-sm text-gray-600">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </Card>

      {/* Clock Actions */}
      <div className="grid grid-cols-2 gap-3">
        {!clockStatus?.clockedIn && (
          <Button
            size="lg"
            className="h-32 flex-col gap-2 bg-green-600 hover:bg-green-700"
            onClick={() => handleClockAction('clock_in')}
          >
            <CheckCircle className="w-10 h-10" />
            <span>Clock In</span>
          </Button>
        )}

        {clockStatus?.clockedIn && !clockStatus?.onBreak && (
          <>
            <Button
              size="lg"
              className="h-32 flex-col gap-2 bg-amber-600 hover:bg-amber-700"
              onClick={() => handleClockAction('break_start')}
            >
              <Coffee className="w-10 h-10" />
              <span>Start Break</span>
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="h-32 flex-col gap-2"
              onClick={() => handleClockAction('clock_out')}
            >
              <LogOut className="w-10 h-10" />
              <span>Clock Out</span>
            </Button>
          </>
        )}

        {clockStatus?.onBreak && (
          <Button
            size="lg"
            className="h-32 flex-col gap-2 bg-blue-600 hover:bg-blue-700 col-span-2"
            onClick={() => handleClockAction('break_end')}
          >
            <CheckCircle className="w-10 h-10" />
            <span>End Break</span>
          </Button>
        )}
      </div>

      {/* Today's Punches */}
      {clockStatus?.punches && clockStatus.punches.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Today's Activity</h3>
          <div className="space-y-2">
            {clockStatus.punches.map((punch: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-600">
                  {punch.punch_type.replace('_', ' ')}
                </span>
                <span className="font-medium">
                  {new Date(punch.punch_time).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Location Status */}
      {location && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <MapPin className="w-4 h-4" />
          <span>Location verified ({location.coords.accuracy.toFixed(0)}m)</span>
        </div>
      )}
    </div>
  );
}

function ScheduleTab({ employee }: { employee: any }) {
  return (
    <Card className="p-6 text-center">
      <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">Your Schedule</h3>
      <p className="text-gray-600">Schedule view coming soon</p>
    </Card>
  );
}

function SettingsTab({ employee }: { employee: any }) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Settings</h3>
      <div className="space-y-3">
        <Button variant="outline" className="w-full justify-start">
          <Settings className="w-5 h-5 mr-2" />
          Notifications
        </Button>
        <Button variant="outline" className="w-full justify-start text-red-600">
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </Button>
      </div>
    </Card>
  );
}
