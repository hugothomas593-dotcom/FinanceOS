export const AVENOR_TRIAL_DAYS = 30;

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
    successUrl: new URL('/subscribe?checkout=success', origin).toString(),
    cancelUrl: new URL('/subscribe?checkout=cancelled', origin).toString(),
  };
}

export function billingPortalReturnUrl(appUrl: string): string {
  const origin = new URL(appUrl);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost') {
    throw new Error('Application URL must use HTTPS');
  }
  return new URL('/app?billing=returned', origin).toString();
}


export type StripePriceShape = {
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  recurring?: {
    interval?: string;
    interval_count?: number;
  } | null;
};

/** Avenor Founder is intentionally one active EUR 59 monthly subscription. */
export function isAvenorFounderPrice(price: StripePriceShape | null | undefined): boolean {
  return Boolean(
    price?.active === true &&
    price.currency?.toLowerCase() === 'eur' &&
    price.unit_amount === 5_900 &&
    price.recurring?.interval === 'month' &&
    price.recurring.interval_count === 1,
  );
}
