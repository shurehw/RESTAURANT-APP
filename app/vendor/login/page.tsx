/**
 * app/vendor/login/page.tsx
 * Vendor portal login page
 */

import { VendorLoginForm } from '@/components/auth/VendorLoginForm';

export default function VendorLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h1 className="text-3xl font-bold text-center">OpsOS Vendor Portal</h1>
          <h2 className="mt-2 text-xl text-center text-gray-600">
            Invoice Management
          </h2>
        </div>

        <VendorLoginForm />
      </div>
    </div>
  );
}
