import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  if (!url || !key) {
    if (pathname === '/' || pathname.startsWith('/onboarding')) return NextResponse.redirect(new URL('/login?configuration=missing', request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const protectedPage = pathname === '/' || pathname.startsWith('/onboarding');
  if (protectedPage && !user) return NextResponse.redirect(new URL('/login', request.url));

  if (user && (pathname === '/' || pathname.startsWith('/onboarding') || pathname === '/login')) {
    const { data: membership } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle();
    if (!membership && pathname !== '/onboarding') return NextResponse.redirect(new URL('/onboarding', request.url));
    if (membership && (pathname === '/onboarding' || pathname === '/login')) return NextResponse.redirect(new URL('/', request.url));
  }
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
