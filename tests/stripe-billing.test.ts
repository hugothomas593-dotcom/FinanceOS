import { describe, expect, it } from 'vitest';
import {
  billingPortalReturnUrl,
  billingReturnUrls,
  canStartCheckout,
} from '../src/lib/stripe-billing';

describe('Stripe subscription checkout policy', () => {
  it('allows a first subscription when the workspace has no Stripe subscription ID', () => {
    expect(canStartCheckout(null, null)).toBe(true);
    expect(canStartCheckout('canceled', null)).toBe(true);
  });

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])(
    'blocks a second Checkout session while a subscription is %s',
    (status) => {
      expect(canStartCheckout(status, 'sub_existing')).toBe(false);
    },
  );

  it.each(['canceled', 'incomplete_expired'])(
    'allows a replacement subscription after %s',
    (status) => {
      expect(canStartCheckout(status, 'sub_previous')).toBe(true);
    },
  );
});

describe('Stripe return URLs', () => {
  it('returns successful and canceled Checkout sessions to the authenticated app', () => {
    expect(billingReturnUrls('https://avenor.example')).toEqual({
      successUrl: 'https://avenor.example/app?billing=success',
      cancelUrl: 'https://avenor.example/app?billing=cancelled',
    });
  });

  it('returns the Customer Portal to the billing area inside the app', () => {
    expect(billingPortalReturnUrl('https://avenor.example'))
      .toBe('https://avenor.example/app?billing=returned');
  });

  it('rejects insecure non-localhost URLs', () => {
    expect(() => billingReturnUrls('http://avenor.example')).toThrow('Application URL must use HTTPS');
    expect(() => billingPortalReturnUrl('http://avenor.example')).toThrow('Application URL must use HTTPS');
  });

  it('permits localhost for local development', () => {
    expect(billingReturnUrls('http://localhost:3000').successUrl)
      .toBe('http://localhost:3000/app?billing=success');
  });
});
