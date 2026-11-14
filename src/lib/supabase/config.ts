/**
 * Shared public Supabase configuration.
 * Prefer the modern publishable key; retain the legacy anon key as a migration fallback.
 * Never place service-role or secret keys in NEXT_PUBLIC_* variables.
 */
export function getSupabasePublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}
