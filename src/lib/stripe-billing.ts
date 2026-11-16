const restartableSubscriptionStatuses = new Set(['canceled', 'incomplete_expired']);

/**
 * Avoid creating a second subscription while Stripe already has one linked.
 * A canceled or expired subscription can be replaced for the same workspace.
 */
export function canStartCheckout(
  status: string | null | undefined,
  stripeSubscriptionId: string | null | undefined,
): boolean {
  if (!stripeSubscriptionId) return true;
  return Boolean(status && restartableSubscriptionStatuses.has(status));
}

export function billingReturnUrls(appUrl: string): { successUrl: string; cancelUrl: string } {
  const origin = new URL(appUrl);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('Application URL must use HTTPS');
  }

  return {
    successUrl: new URL('/app?billing=success', origin).toString(),
    cancelUrl: new URL('/app?billing=cancelled', origin).toString(),
  };
}

export function billingPortalReturnUrl(appUrl: string): string {
  const origin = new URL(appUrl);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('Application URL must use HTTPS');
  }
  return new URL('/app?billing=returned', origin).toString();
}
