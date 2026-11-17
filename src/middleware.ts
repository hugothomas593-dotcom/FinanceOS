import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { isSameOriginMutation } from '@/lib/request-security';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAppPage = pathname === '/app' || pathname.startsWith('/app/');
  const isOnboarding = pathname === '/onboarding' || pathname.startsWith('/onboarding');
  const isSubscribe = pathname === '/subscribe' || pathname.startsWith('/subscribe/');
  const isProtectedPage = isAppPage || isOnboarding || isSubscribe;
  const supabaseConfig = getSupabasePublicConfig();

  // Cookie-authenticated write routes must not accept cross-site browser requests.
  // Stripe webhooks authenticate independently with their signed payload.
  const isMutatingApi = pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) &&
    pathname !== '/api/billing/webhook';
  if (isMutatingApi && !isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
  }

  // The public marketing site must remain accessible even before setup.
  if (!supabaseConfig) {
    if (isProtectedPage) {
      return NextResponse.redirect(new URL('/login?configuration=missing', request.url));
    }
    return NextResponse.next();
  }

  // Do not make public landing-page requests depend on an Auth round trip.
  if (pathname === '/') return NextResponse.next();

  // Only resolve an Auth session on routes whose destination depends on it.
  if (!isProtectedPage && pathname !== '/login') return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims ?? null;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;

  const redirectWithCookies = (destination: string) => {
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (['cache-control', 'expires', 'pragma'].includes(key.toLowerCase())) {
        redirectResponse.headers.set(key, value);
      }
    });
    return redirectResponse;
  };

  if (isProtectedPage && !userId) return redirectWithCookies('/login');

  if (userId && (isAppPage || isOnboarding || isSubscribe || pathname === '/login')) {
    const requestedOrganizationId = isSubscribe
      ? request.nextUrl.searchParams.get('organizationId')
      : null;
    const cookieOrganizationId = request.cookies.get('avenor_organization_id')?.value ?? null;
    const preferredOrganizationId = requestedOrganizationId || cookieOrganizationId;
    const isUuid = (value: string | null): value is string =>
      Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

    let membershipQuery = supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (isUuid(preferredOrganizationId)) {
      membershipQuery = membershipQuery.eq('organization_id', preferredOrganizationId);
    }

    let { data: membership, error: membershipError } = await membershipQuery.maybeSingle();
    if (!membership && !membershipError && isUuid(preferredOrganizationId)) {
      const fallback = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      membership = fallback.data;
      membershipError = fallback.error;
    }

    if (membershipError) {
      if (pathname === '/login' || isOnboarding) return response;
      return redirectWithCookies('/login?error=workspace_verification');
    }

    if (!membership) {
      if (isAppPage || isSubscribe) return redirectWithCookies('/onboarding');
      if (isOnboarding || pathname === '/login') return response;
    }

    if (membership) {
      // This public RPC returns only a boolean. It does not expose Stripe IDs or
      // other billing metadata to ordinary workspace members.
      const { data: hasAccess, error: entitlementError } = await supabase.rpc(
        'has_organization_access',
        { org_id: membership.organization_id },
      );
      // Allow authenticated product testing on this dedicated Preview branch only.
      // Production and every other Preview branch continue to require a paid/trial entitlement.
      const founderPreviewAccess = process.env.VERCEL_ENV === 'preview' &&
        process.env.VERCEL_GIT_COMMIT_REF === 'feat/avenor-founder-value';
      const entitled = founderPreviewAccess || (!entitlementError && hasAccess === true);
      const organizationQuery = '?organizationId=' + encodeURIComponent(membership.organization_id);

      if (isAppPage && !entitled) return redirectWithCookies('/subscribe' + organizationQuery);
      if (isOnboarding) return redirectWithCookies(entitled ? '/app' : '/subscribe' + organizationQuery);
      if (pathname === '/login') return redirectWithCookies(entitled ? '/app' : '/subscribe' + organizationQuery);
      if (isSubscribe && entitled) return redirectWithCookies('/app');
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
