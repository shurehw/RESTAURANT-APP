import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/signup', '/vendor-onboarding', '/vendor/login', '/host-stand/login', '/coming-soon', '/api/landing', '/share', '/api/share', '/accept-invite'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // Marketing domain — serve landing page on root only for unauthenticated visitors
  if (hostname.includes('prime-cost.com') && pathname === '/') {
    const hasSession = request.cookies.getAll().some(c => c.name.includes('-auth-token'));
    const hasLegacy = request.cookies.get('user_id');
    if (!hasSession && !hasLegacy) {
      return NextResponse.rewrite(new URL('/coming-soon.html', request.url));
    }
  }

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // ========================================================================
  // Supabase session refresh (standard SSR pattern)
  // Calling getUser() refreshes expired access tokens using the refresh token.
  // Refreshed cookies are forwarded to both the browser (response) and
  // downstream route handlers (updated request).
  // ========================================================================
  let supabaseResponse = NextResponse.next({ request });

  const hasSupabaseSession = request.cookies.getAll().some(
    cookie => cookie.name.includes('-auth-token')
  );

  let supabaseUser = null;

  if (hasSupabaseSession) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Update request cookies so downstream route handlers see refreshed tokens
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            // Update response cookies so the browser stores refreshed tokens
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    supabaseUser = user;
  }

  // API routes handle their own auth — pass through with refreshed cookies
  if (pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  // Check for legacy user_id cookie (migration support)
  // Allow access only with valid Supabase auth session.
  // Legacy user_id cookie is not sufficient for access control.
  if (supabaseUser) {
    return supabaseResponse;
  }

  // No authentication found — redirect to login
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
