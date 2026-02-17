/**
 * app/login/page.tsx
 * Login page with email/password authentication
 * PWA-aware: safe area padding, larger touch targets in standalone mode
 */

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import { OpsOSLogo } from '@/components/ui/OpsOSLogo';
import { Shield, Lock, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-white px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-md w-full space-y-8 bg-white border border-opsos-slate-200 overflow-hidden">
        {/* Accent rule */}
        <div className="h-0.5 bg-brass" />

        <div className="px-8 pt-4 pb-0 space-y-8">
          <div className="flex flex-col items-center">
            <OpsOSLogo size="xl" className="mb-4" />
            <p className="text-sm text-center text-muted-foreground">Pulse</p>
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
          <div className="pt-6 pb-8 border-t border-border" data-pwa-hide>
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-sage" />
                <span>SOC 2 Type II</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-sage" />
                <span>256-bit SSL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-sage" />
                <span>GDPR Compliant</span>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Your data is encrypted at rest and in transit. We never share your information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
