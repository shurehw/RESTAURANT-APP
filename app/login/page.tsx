/**
 * app/login/page.tsx
 * Login page with email/password authentication
 */

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import { Shield, Lock, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-3xl font-bold text-center">OpsOS</h1>
          <h2 className="mt-2 text-xl text-center text-gray-600">
            Restaurant Operations
          </h2>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <div className="text-center text-sm">
          <p className="text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>

        {/* Security Badges */}
        <div className="pt-6 border-t border-gray-200">
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
