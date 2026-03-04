'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface InviteInfo {
  org_name: string;
  role: string;
  role_name: string;
  email: string;
}

export default function AcceptInviteForm({ token }: { token: string }) {
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.success) {
          setInviteInfo(data.invite);
        } else {
          setError(data.error || 'Invalid invitation');
        }
      } catch {
        setError('Failed to validate invitation');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || password.length < 6) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: fullName.trim(), password }),
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = data.redirect || '/';
      } else {
        setSubmitError(data.error || 'Failed to accept invitation');
      }
    } catch {
      setSubmitError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <p className="text-gray-500">Validating invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Invitation Invalid</h1>
        <p className="text-gray-600">{error}</p>
        <a
          href="/login"
          className="inline-block mt-4 text-sm text-opsos-sage-600 hover:underline"
        >
          Go to login
        </a>
      </div>
    );
  }

  if (!inviteInfo) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-2xl font-bold text-gray-900 mb-1">OpSOS</div>
        <h1 className="text-xl font-semibold text-gray-800 mt-4">
          Join {inviteInfo.org_name}
        </h1>
        <div className="mt-3">
          <Badge variant="sage">{inviteInfo.role_name}</Badge>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          You&apos;ve been invited as <strong>{inviteInfo.email}</strong>
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Full Name
          </label>
          <Input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            minLength={6}
          />
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <Button
          type="submit"
          disabled={submitting || !fullName.trim() || password.length < 6}
          className="w-full bg-opsos-sage-600 hover:bg-opsos-sage-700"
        >
          {submitting ? 'Creating account...' : 'Accept Invitation'}
        </Button>
      </form>

      <p className="text-center text-xs text-gray-400 mt-6">
        Already have an account?{' '}
        <a href="/login" className="text-opsos-sage-600 hover:underline">
          Log in
        </a>
      </p>
    </div>
  );
}
