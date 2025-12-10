/**
 * app/vendor/dashboard/page.tsx
 * Vendor portal dashboard - view and manage invoices
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { VendorInvoiceList } from '@/components/vendor/VendorInvoiceList';
import { VendorHeader } from '@/components/vendor/VendorHeader';

export default async function VendorDashboardPage() {
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/vendor/login');
  }

  // Get vendor info
  const { data: vendorUser, error: vendorError } = await supabase
    .from('vendor_users')
    .select('vendor_id, vendors(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (vendorError || !vendorUser) {
    redirect('/vendor/login');
  }

  // Handle vendors relation (can be object or array depending on Supabase version)
  const vendorName = Array.isArray(vendorUser.vendors) 
    ? vendorUser.vendors[0]?.name 
    : (vendorUser.vendors as any)?.name;

  return (
    <div className="min-h-screen bg-gray-50">
      <VendorHeader
        vendorName={vendorName || 'Vendor Portal'}
        userEmail={user.email || ''}
      />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <VendorInvoiceList vendorId={vendorUser.vendor_id} />
      </main>
    </div>
  );
}
