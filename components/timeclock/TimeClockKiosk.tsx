'use client';

/**
 * Time Clock Kiosk Component
 * iPad/tablet interface for employee clock in/out
 * Features: PIN entry, photo capture, GPS verification
 */

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Camera,
  MapPin,
  CheckCircle,
  AlertCircle,
  Coffee,
  LogOut,
  X,
} from 'lucide-react';

export function TimeClockKiosk() {
  const [step, setStep] = useState<'pin' | 'action' | 'photo' | 'success'>('pin');
  const [pin, setPin] = useState('');
  const [employee, setEmployee] = useState<any>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [clockStatus, setClockStatus] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Get GPS location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation(position),
        (error) => console.error('Geolocation error:', error)
      );
    }
  }, []);

  const handlePinInput = (digit: string) => {
    if (digit === 'clear') {
      setPin('');
    } else if (digit === 'back') {
      setPin((prev) => prev.slice(0, -1));
    } else if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);

      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const verifyPin = async (pinCode: string) => {
    setProcessing(true);
    try {
      // TODO: Verify PIN against employee database
      // For now, mock employee
      const mockEmployee = {
        id: 'emp-123',
        first_name: 'John',
        last_name: 'Doe',
        pin: '1234',
      };

      if (pinCode === mockEmployee.pin) {
        setEmployee(mockEmployee);

        // Get current clock status
        const response = await fetch(
          `/api/timeclock/punch?employee_id=${mockEmployee.id}&venue_id=venue-123&business_date=${currentTime.toISOString().split('T')[0]}`
        );
        const status = await response.json();
        setClockStatus(status);

        setStep('action');
      } else {
        alert('Invalid PIN');
        setPin('');
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      alert('Error verifying PIN');
    } finally {
      setProcessing(false);
    }
  };

  const handleActionSelect = async (action: string) => {
    setSelectedAction(action);
    setStep('photo');
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
      alert('Camera access required for verification');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        canvasRef.current.toBlob((blob) => {
          if (blob) {
            setPhoto(blob);
            stopCamera();
            submitPunch(blob);
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const submitPunch = async (photoBlob: Blob) => {
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('employee_id', employee.id);
      formData.append('venue_id', 'venue-123'); // TODO: Get from context
      formData.append('punch_type', selectedAction || 'clock_in');
      formData.append('photo', photoBlob, 'selfie.jpg');

      if (location) {
        formData.append('latitude', location.coords.latitude.toString());
        formData.append('longitude', location.coords.longitude.toString());
        formData.append('accuracy', location.coords.accuracy.toString());
      }

      formData.append('device_id', navigator.userAgent);

      const response = await fetch('/api/timeclock/punch', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setStep('success');
        setTimeout(() => reset(), 3000);
      } else {
        alert(result.error || 'Failed to record punch');
        reset();
      }
    } catch (error) {
      console.error('Punch submission error:', error);
      alert('Error submitting punch');
      reset();
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setStep('pin');
    setPin('');
    setEmployee(null);
    setSelectedAction(null);
    setPhoto(null);
    setClockStatus(null);
    stopCamera();
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-2xl p-8 bg-white shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Clock className="w-12 h-12 text-opsos-sage-600" />
            <h1 className="text-4xl font-bold text-gray-900">Time Clock</h1>
          </div>
          <div className="text-3xl font-bold text-opsos-brass-600">
            {currentTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </div>
          <div className="text-lg text-gray-600">
            {currentTime.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>

        {/* PIN Entry Step */}
        {step === 'pin' && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Enter Your PIN
              </h2>
              <div className="flex justify-center gap-3 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 flex items-center justify-center text-3xl font-bold"
                  >
                    {pin[i] ? '•' : ''}
                  </div>
                ))}
              </div>
            </div>

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <Button
                  key={num}
                  size="lg"
                  variant="outline"
                  className="text-3xl h-20 font-bold"
                  onClick={() => handlePinInput(num)}
                >
                  {num}
                </Button>
              ))}
              <Button
                size="lg"
                variant="outline"
                className="text-xl h-20"
                onClick={() => handlePinInput('clear')}
              >
                Clear
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-3xl h-20 font-bold"
                onClick={() => handlePinInput('0')}
              >
                0
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-xl h-20"
                onClick={() => handlePinInput('back')}
              >
                ← Back
              </Button>
            </div>
          </div>
        )}

        {/* Action Selection Step */}
        {step === 'action' && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Welcome, {employee?.first_name}!
              </h2>
              {clockStatus && (
                <div className="text-lg text-gray-600">
                  {clockStatus.clockedIn ? (
                    <Badge variant="default" className="text-lg px-4 py-2">
                      Currently Clocked In • {clockStatus.hoursWorked.toFixed(2)}h
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-lg px-4 py-2">
                      Not Clocked In
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {!clockStatus?.clockedIn && (
                <Button
                  size="lg"
                  className="h-32 text-2xl flex-col gap-3 bg-green-600 hover:bg-green-700"
                  onClick={() => handleActionSelect('clock_in')}
                >
                  <CheckCircle className="w-12 h-12" />
                  Clock In
                </Button>
              )}

              {clockStatus?.clockedIn && !clockStatus?.onBreak && (
                <>
                  <Button
                    size="lg"
                    className="h-32 text-2xl flex-col gap-3 bg-amber-600 hover:bg-amber-700"
                    onClick={() => handleActionSelect('break_start')}
                  >
                    <Coffee className="w-12 h-12" />
                    Start Break
                  </Button>
                  <Button
                    size="lg"
                    variant="destructive"
                    className="h-32 text-2xl flex-col gap-3"
                    onClick={() => handleActionSelect('clock_out')}
                  >
                    <LogOut className="w-12 h-12" />
                    Clock Out
                  </Button>
                </>
              )}

              {clockStatus?.onBreak && (
                <Button
                  size="lg"
                  className="h-32 text-2xl flex-col gap-3 bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleActionSelect('break_end')}
                >
                  <CheckCircle className="w-12 h-12" />
                  End Break
                </Button>
              )}

              <Button
                size="lg"
                variant="outline"
                className="h-32 text-2xl flex-col gap-3"
                onClick={reset}
              >
                <X className="w-12 h-12" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Photo Capture Step */}
        {step === 'photo' && (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Take Verification Photo
            </h2>

            <div className="relative mb-6 bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-96 object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-4 justify-center">
              <Button
                size="lg"
                className="text-xl px-8"
                onClick={capturePhoto}
                disabled={processing}
              >
                <Camera className="w-6 h-6 mr-2" />
                {processing ? 'Processing...' : 'Capture Photo'}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-xl px-8"
                onClick={reset}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="text-center">
            <CheckCircle className="w-24 h-24 text-green-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Success!
            </h2>
            <p className="text-xl text-gray-600 mb-4">
              {selectedAction === 'clock_in' && `Welcome back, ${employee?.first_name}!`}
              {selectedAction === 'clock_out' && `Have a great day, ${employee?.first_name}!`}
              {selectedAction === 'break_start' && `Enjoy your break!`}
              {selectedAction === 'break_end' && `Break ended`}
            </p>
            <div className="text-lg text-gray-500">
              Recorded at {currentTime.toLocaleTimeString()}
            </div>
          </div>
        )}

        {/* Location Indicator */}
        {location && (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
            <MapPin className="w-4 h-4" />
            <span>Location verified ({location.coords.accuracy.toFixed(0)}m accuracy)</span>
          </div>
        )}
      </Card>
    </div>
  );
}
