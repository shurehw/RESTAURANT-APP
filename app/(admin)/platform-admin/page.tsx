/**
 * Admin Dashboard
 * Overview of platform stats
 */

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdminDashboard() {
  const adminClient = createAdminClient();
  
  // Get stats
  const { count: orgCount } = await adminClient
    .from('organizations')
    .select('*', { count: 'exact', head: true });

  const { data: authUsers } = await adminClient.auth.admin.listUsers();
  const userCount = authUsers?.users?.length || 0;

  const { count: membershipCount } = await adminClient
    .from('organization_users')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: invoiceCount } = await adminClient
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  const { count: vendorCount } = await adminClient
    .from('vendors')
    .select('*', { count: 'exact', head: true });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Platform Overview</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Organizations"
          value={orgCount || 0}
          href="/platform-admin/organizations"
          color="bg-blue-500"
        />
        <StatCard
          title="Users"
          value={userCount}
          href="/platform-admin/users"
          color="bg-green-500"
        />
        <StatCard
          title="Active Memberships"
          value={membershipCount || 0}
          color="bg-purple-500"
        />
        <StatCard
          title="Total Invoices"
          value={invoiceCount || 0}
          color="bg-orange-500"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/platform-admin/organizations/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + Create Organization
          </Link>
          <Link
            href="/platform-admin/users"
            className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            View All Users
          </Link>
        </div>
      </div>

      {/* Recent Activity placeholder */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Info</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Total Vendors</dt>
            <dd className="font-medium">{vendorCount || 0}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Multi-tenant Status</dt>
            <dd className="font-medium text-green-600">Active</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  href, 
  color 
}: { 
  title: string; 
  value: number; 
  href?: string;
  color: string;
}) {
  const content = (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`${color} rounded-full p-3`}>
          <div className="w-6 h-6 text-white" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:shadow-lg transition-shadow">
        {content}
      </Link>
    );
  }

  return content;
}
