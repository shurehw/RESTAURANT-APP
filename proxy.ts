import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/signup',
  '/vendor-onboarding',
  '/vendor/login',
  '/host-stand/login',
  '/coming-soon',
  '/deck',
  '/api/deck',
  '/api/landing',
  '/share',
  '/api/share',
  '/accept-invite',
  '/sw.js',
  '/manifest.json',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';

  // Common typo guard: redirect /logn to /login
  if (pathname === '/logn') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Non-primary domains -> redirect everything to kevaos.ai
  if (
    (hostname.includes('prime-cost.com') || hostname.includes('opsos-restaurant-app.vercel.app')) &&
    !hostname.includes('kevaos.ai')
  ) {
    return NextResponse.redirect(new URL(`https://kevaos.ai${pathname}`, request.url), 301);
  }

  // Marketing domain -> serve coming-soon page on root for unauthenticated visitors
  if (hostname.includes('kevaos.ai') && pathname === '/') {
    const hasSession = request.cookies.getAll().some((c) => c.name.includes('-auth-token'));
    const hasLegacy = request.cookies.get('user_id');
    if (!hasSession && !hasLegacy) {
      return NextResponse.rewrite(new URL('/coming-soon', request.url));
    }
  }

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Standard Supabase SSR session refresh.
  let supabaseResponse = NextResponse.next({ request });

  const hasSupabaseSession = request.cookies.getAll().some(
    (cookie) => cookie.name.includes('-auth-token'),
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
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    supabaseUser = user;
  }

  // API routes handle their own auth.
  if (pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  if (supabaseUser) {
    return supabaseResponse;
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
