/**
 * app/host-stand/login/page.tsx
 * Host stand login page — separate auth surface for iPad host stations.
 * Pattern: app/vendor/login/page.tsx
 */

import { HostStandLoginForm } from '@/components/host-stand/HostStandLoginForm';

export default function HostStandLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1C1917]">
      <div className="max-w-md w-full space-y-8 p-10 bg-[#141414] rounded-xl shadow-2xl border border-gray-800">
        <div>
          <h1 className="text-3xl font-bold text-center text-white tracking-tight">
            KevaOS
          </h1>
          <h2 className="mt-2 text-lg text-center text-[#D4622B] font-medium">
            Host Stand
          </h2>
        </div>
        <HostStandLoginForm />
      </div>
    </div>
  );
}
