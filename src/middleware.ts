import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const config = getSupabasePublicConfig();

  if (!config) {
    if (pathname === '/' || pathname.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/login?configuration=missing', request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Forward Supabase SSR cache headers so a CDN cannot cache a response
        // containing a user's refreshed authentication cookies.
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // Supabase recommends getClaims() for server-side route protection.
  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims ?? null;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;

  const protectedPage =
    pathname === '/' || pathname.startsWith('/onboarding');

  const redirectWithCookies = (destination: string) => {
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    response.headers.forEach((value, key) => {
      if (['cache-control', 'expires', 'pragma'].includes(key.toLowerCase())) {
        redirectResponse.headers.set(key, value);
      }
    });
    return redirectResponse;
  };

  if (protectedPage && !userId) {
    return redirectWithCookies('/login');
  }

  if (
    userId &&
    (pathname === '/' ||
      pathname.startsWith('/onboarding') ||
      pathname === '/login')
  ) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!membership && pathname !== '/onboarding') {
      return redirectWithCookies('/onboarding');
    }

    if (membership && (pathname === '/onboarding' || pathname === '/login')) {
      return redirectWithCookies('/');
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
