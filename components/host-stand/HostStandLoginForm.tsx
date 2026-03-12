'use client';

/**
 * Host stand login form — email + password auth scoped to a venue.
 * Pattern: components/auth/VendorLoginForm.tsx
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function HostStandLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Verify user has host stand access
      const { data: hostUser, error: hostError } = await supabase
        .from('host_stand_users')
        .select('id, venue_id')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
        .single();

      if (hostError || !hostUser) {
        await supabase.auth.signOut();
        throw new Error('You do not have host stand access');
      }

      router.push(`/host-stand?venue_id=${hostUser.venue_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F]"
          placeholder="host@venue.com"
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F]"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <Button
        type="submit"
        className="w-full h-14 text-lg font-semibold bg-[#FF5A1F] hover:bg-[#E04D18] text-white"
        disabled={loading}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  );
}
