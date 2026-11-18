import { describe, expect, it } from 'vitest';
import { isSubscriptionEntitled } from '../src/lib/billing-entitlements';

const future = '2030-01-01T00:00:00.000Z';

describe('Avenor subscription entitlement', () => {
  it.each(['trialing', 'active'])('grants access while %s has not expired', (status) => {
    expect(isSubscriptionEntitled(status, future, Date.parse('2029-12-31T23:59:59.000Z'))).toBe(true);
  });

  it.each(['canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', null, undefined])(
    'denies access for subscription status %s',
    (status) => {
      expect(isSubscriptionEntitled(status, future)).toBe(false);
    },
  );

  it('denies access when a trial or billing period has ended', () => {
    expect(isSubscriptionEntitled('trialing', '2026-11-15T00:00:00.000Z', Date.parse('2026-11-16T00:00:00.000Z'))).toBe(false);
  });

  it('fails closed when the subscription has no valid expiry', () => {
    expect(isSubscriptionEntitled('active', null)).toBe(false);
    expect(isSubscriptionEntitled('trialing', 'not-a-date')).toBe(false);
  });
});
