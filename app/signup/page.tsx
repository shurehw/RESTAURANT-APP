/**
 * app/signup/page.tsx
 * Signup page for new users
 */

import { SignupForm } from '@/components/auth/SignupForm';
import Link from 'next/link';
import Image from 'next/image';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full space-y-8 bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Orange accent line */}
        <div className="h-1 bg-brass" />

        <div className="px-8 pt-4 pb-8 space-y-8">
          <div className="flex flex-col items-center">
            <Image
              src="/opsos-logo.png"
              alt="OpsOS"
              width={120}
              height={40}
              className="h-10 w-auto mb-4"
              priority
            />
            <h1 className="text-3xl font-bold text-center font-heading">OpsOS</h1>
            <h2 className="mt-2 text-xl text-center text-muted-foreground">
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
