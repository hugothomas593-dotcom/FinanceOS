/**
 * Stronger sign-up password policy enforced by the Avenor registration UI.
 * Supabase-side leaked-password protection still requires a paid Supabase plan.
 */
export function meetsMinimumPasswordPolicy(password: string): boolean {
  return password.length >= 12 &&
    /\p{Ll}/u.test(password) &&
    /\p{Lu}/u.test(password) &&
    /\p{N}/u.test(password) &&
    /[^\p{L}\p{N}]/u.test(password);
}
