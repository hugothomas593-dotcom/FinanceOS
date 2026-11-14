import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const config = getSupabasePublicConfig();

  // Only permit same-origin relative destinations. Never accept protocol-relative
  // URLs or backslash variants from the query string.
  const requestedNext = searchParams.get('next');
  const next =
    requestedNext &&
    requestedNext.startsWith('/') &&
    !requestedNext.startsWith('//') &&
    !requestedNext.includes('\\')
      ? requestedNext
      : '/onboarding';

  if (!code || !config) {
    return NextResponse.redirect(new URL('/login?error=auth_callback', origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth_callback', origin));
  }

  return response;
}
