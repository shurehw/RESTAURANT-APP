/**
 * Admin Layout
 * Gates all /admin/* routes to platform admins only
 */

import { redirect } from 'next/navigation';
import { getPlatformAdminContext } from '@/lib/auth/requirePlatformAdmin';
import Link from 'next/link';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminContext = await getPlatformAdminContext();
  
  if (!adminContext) {
    redirect('/login?error=admin_required');
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Admin Header */}
      <header className="bg-red-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <span className="text-xl font-bold">Platform Admin</span>
              <nav className="flex space-x-4">
                <Link 
                  href="/platform-admin" 
                  className="px-3 py-2 rounded-md text-sm font-medium hover:bg-red-600"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/platform-admin/organizations" 
                  className="px-3 py-2 rounded-md text-sm font-medium hover:bg-red-600"
                >
                  Organizations
                </Link>
                <Link 
                  href="/platform-admin/users" 
                  className="px-3 py-2 rounded-md text-sm font-medium hover:bg-red-600"
                >
                  Users
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm opacity-75">{adminContext.email}</span>
              <Link 
                href="/" 
                className="px-3 py-2 rounded-md text-sm font-medium bg-red-800 hover:bg-red-900"
              >
                Exit Admin
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Admin Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
