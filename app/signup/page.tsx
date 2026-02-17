/**
 * app/signup/page.tsx
 * Signup page for new users
 */

import { SignupForm } from '@/components/auth/SignupForm';
import Link from 'next/link';
import { OpsOSLogo } from '@/components/ui/OpsOSLogo';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full space-y-8 bg-white border border-opsos-slate-200 overflow-hidden">
        {/* Accent rule */}
        <div className="h-0.5 bg-brass" />

        <div className="px-8 pt-4 pb-8 space-y-8">
          <div className="flex flex-col items-center">
            <OpsOSLogo size="xl" className="mb-4" />
            <h2 className="text-xl text-center text-muted-foreground">
              Create Account
            </h2>
          </div>

          <SignupForm />

          <div className="text-center text-sm">
            <p className="text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
