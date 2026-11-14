import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();

  if (!config) {
    throw new Error('Supabase is not configured');
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options: any;
        }>,
        _headers
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always mutate cookies.
          // The Next.js middleware refreshes sessions and writes response cookies.
        }
      },
    },
  });
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('UNAUTHENTICATED');
  }

  return { supabase, user };
}
