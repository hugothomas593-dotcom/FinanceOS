import { describe, expect, it } from 'vitest';
import {
  AVENOR_TRIAL_DAYS,
  buildCheckoutSessionParams,
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
      successUrl: 'https://avenor.example/subscribe?checkout=success',
      cancelUrl: 'https://avenor.example/subscribe?checkout=cancelled',
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



describe('Stripe Checkout trial parameters', () => {
  const base = {
    organizationId: 'org-avenor',
    ownerUserId: 'user-avenor',
    priceId: 'price_avenor',
    successUrl: 'https://avenor.example/subscribe?checkout=success',
    cancelUrl: 'https://avenor.example/subscribe?checkout=cancelled',
  };

  it('collects a card and applies a 30-day trial without charging at signup', () => {
    const params = buildCheckoutSessionParams({ ...base, trialEligible: true, customerEmail: 'founder@example.com' });
    expect(params.get('mode')).toBe('subscription');
    expect(params.get('payment_method_collection')).toBe('always');
    expect(params.get('subscription_data[trial_period_days]')).toBe('30');
    expect(params.get('subscription_data[trial_settings][end_behavior][missing_payment_method]')).toBe('cancel');
    expect(params.get('customer_email')).toBe('founder@example.com');
    expect(params.get('subscription_data[metadata][owner_user_id]')).toBe('user-avenor');
  });

  it('does not grant a second free trial to a returning subscriber', () => {
    const params = buildCheckoutSessionParams({ ...base, trialEligible: false, customerId: 'cus_existing' });
    expect(params.get('payment_method_collection')).toBe('always');
    expect(params.get('subscription_data[trial_period_days]')).toBeNull();
    expect(params.get('subscription_data[trial_settings][end_behavior][missing_payment_method]')).toBeNull();
    expect(params.get('customer')).toBe('cus_existing');
  });
});

describe('Avenor free trial configuration', () => {
  it('offers a 30-day trial', () => {
    expect(AVENOR_TRIAL_DAYS).toBe(30);
  });
});

describe('Avenor Founder Stripe price validation', () => {
  const validPrice = {
    active: true,
    currency: 'eur',
    unit_amount: 5_900,
    recurring: { interval: 'month', interval_count: 1 },
  };

  it('accepts only an active EUR 59 monthly price', async () => {
    const { isAvenorFounderPrice } = await import('../src/lib/stripe-billing');
    expect(isAvenorFounderPrice(validPrice)).toBe(true);
  });

  it.each([
    { ...validPrice, active: false },
    { ...validPrice, currency: 'usd' },
    { ...validPrice, unit_amount: 5_901 },
    { ...validPrice, recurring: { interval: 'year', interval_count: 1 } },
    { ...validPrice, recurring: { interval: 'month', interval_count: 3 } },
    { ...validPrice, recurring: null },
    null,
    undefined,
  ])('rejects an unexpected Stripe price shape', async (price) => {
    const { isAvenorFounderPrice } = await import('../src/lib/stripe-billing');
    expect(isAvenorFounderPrice(price)).toBe(false);
  });
});
