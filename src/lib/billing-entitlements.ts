const entitledStatuses = new Set(['trialing', 'active']);

/**
 * Grants product access only while the Stripe subscription is in an entitled
 * state and its current billing/trial period has not ended.
 */
export function isSubscriptionEntitled(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!status || !entitledStatuses.has(status)) return false;
  if (!currentPeriodEnd) return false;
  const end = Date.parse(currentPeriodEnd);
  return Number.isFinite(end) && end > now;
}
