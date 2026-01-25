import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/signup', '/vendor-onboarding', '/vendor/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow API routes (they handle their own auth)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // ========================================================================
  // Check for authentication: Supabase session OR legacy user_id cookie
  // This supports both the new auth flow and existing users during migration
  // ========================================================================
  
  // Check for legacy user_id cookie
  const legacyUserId = request.cookies.get('user_id');
  
  // Check for Supabase auth cookies (sb-*-auth-token pattern)
  const hasSupabaseSession = Array.from(request.cookies.getAll()).some(
    cookie => cookie.name.includes('-auth-token')
  );

  // Allow access if either auth method is present
  if (legacyUserId || hasSupabaseSession) {
    return NextResponse.next();
  }

  // No authentication found - redirect to login
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
