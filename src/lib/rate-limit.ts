import { createClient } from '@supabase/supabase-js';

export const API_RATE_LIMITS = {
  copilot: { maxRequests: 12, windowSeconds: 60 },
  csvImport: { maxRequests: 5, windowSeconds: 3_600 },
  checkout: { maxRequests: 5, windowSeconds: 3_600 },
  billingPortal: { maxRequests: 10, windowSeconds: 3_600 },
  cfoBrief: { maxRequests: 5, windowSeconds: 300 },
  workspaceDeletion: { maxRequests: 3, windowSeconds: 86_400 },
  workspaceExport: { maxRequests: 3, windowSeconds: 3_600 },
} as const;

export type ApiRateLimitScope = keyof typeof API_RATE_LIMITS;

export type ApiRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Uses a Postgres atomic upsert, rather than process memory, so limits are
 * consistent across Vercel instances and regions. Fails closed on DB errors.
 */
export async function enforceApiRateLimit(
  userId: string,
  scope: ApiRateLimitScope,
): Promise<ApiRateLimitResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Server-side rate limiting is not configured');
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const policy = API_RATE_LIMITS[scope];
  const { data, error } = await admin.rpc('consume_api_rate_limit', {
    p_user_id: userId,
    p_scope: scope,
    p_window_seconds: policy.windowSeconds,
    p_limit: policy.maxRequests,
  });

  if (error) throw new Error('Could not enforce API rate limit');
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result.allowed !== 'boolean') {
    throw new Error('API rate limit returned an invalid result');
  }

  return {
    allowed: result.allowed,
    remaining: Number(result.remaining ?? 0),
    retryAfterSeconds: Math.max(1, Number(result.retry_after_seconds ?? 1)),
  };
}
