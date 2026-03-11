import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';

/**
 * Debug endpoint to check auth status
 * GET /api/debug/auth-status
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient();

    // Get all cookies
    const allCookies = cookieStore.getAll();
    const supabaseCookies = allCookies.filter(c => c.name.includes('sb-'));
    const userIdCookie = cookieStore.get('user_id');

    // Try to get user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    let fallbackUser: any = null;
    let tenantContext: any = null;
    let fallbackError: string | null = null;

    try {
      fallbackUser = await requireUser();
      tenantContext = await getUserOrgAndVenues(fallbackUser.id);
    } catch (error) {
      fallbackError = error instanceof Error
        ? error.message
        : typeof error === 'object' && error && 'message' in error
          ? String((error as any).message)
          : String(error);
    }

    return NextResponse.json({
      authenticated: !!user,
      user: user ? {
        id: user.id,
        email: user.email,
        lastSignIn: user.last_sign_in_at,
      } : null,
      authError: authError?.message || null,
      cookies: {
        userIdCookie: !!userIdCookie,
        supabaseCookies: supabaseCookies.map(c => ({
          name: c.name,
          hasValue: !!c.value,
        })),
        totalCookies: allCookies.length,
      },
      fallbackUser,
      tenantContext,
      fallbackError,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
