/**
 * app/login/page.tsx
 * Login page with email/password authentication
 * PWA-aware: safe area padding, larger touch targets in standalone mode
 */

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import { Shield, Lock, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-xl">
        <div>
          <h1 className="text-3xl font-bold text-center">OpsOS</h1>
          <p className="mt-1 text-sm text-center text-gray-500">Pulse</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        {/* Sign up link — hidden in PWA standalone */}
        <div className="text-center text-sm" data-pwa-hide>
          <p className="text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>

        {/* Security Badges — hidden in PWA standalone */}
        <div className="pt-6 border-t border-gray-200" data-pwa-hide>
          <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-green-600" />
              <span>SOC 2 Type II</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-green-600" />
              <span>256-bit SSL</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>GDPR Compliant</span>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">
            Your data is encrypted at rest and in transit. We never share your information.
          </p>
        </div>
      </div>
    </div>
  );
}
