import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from '../src/lib/stripe-webhook';

const secret = 'whsec_test_avenor';
const now = 1_800_000_000_000;

function signature(body: string, timestamp = Math.floor(now / 1000)) {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('Stripe webhook signature verification', () => {
  it('accepts a correctly signed event inside the tolerance window', () => {
    expect(verifyStripeSignature('{"id":"evt_test"}', signature('{"id":"evt_test"}'), secret, now)).toBe(true);
  });

  it('rejects a body changed after signing', () => {
    expect(verifyStripeSignature('{"id":"evt_changed"}', signature('{"id":"evt_test"}'), secret, now)).toBe(false);
  });

  it('rejects stale signatures', () => {
    const stale = Math.floor(now / 1000) - 301;
    expect(verifyStripeSignature('payload', signature('payload', stale), secret, now)).toBe(false);
  });

  it('accepts a valid signature when Stripe supplies multiple v1 signatures', () => {
    const valid = signature('payload').split(',')[1];
    expect(verifyStripeSignature('payload', `t=${Math.floor(now / 1000)},v1=${'0'.repeat(64)},${valid}`, secret, now)).toBe(true);
  });

  it('rejects malformed headers and missing secrets', () => {
    expect(verifyStripeSignature('payload', 'invalid', secret, now)).toBe(false);
    expect(verifyStripeSignature('payload', signature('payload'), '', now)).toBe(false);
  });
});
