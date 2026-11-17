import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

let cachedAdminClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdminClient() {
  if (cachedAdminClient) return cachedAdminClient;
  const config = getSupabasePublicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !serviceRoleKey) {
    throw new Error('Server-side Supabase service role is not configured');
  }
  cachedAdminClient = createClient(config.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'avenor-server' } },
  });
  return cachedAdminClient;
}
