import { describe, expect, it } from 'vitest';
import { API_RATE_LIMITS } from '../src/lib/rate-limit';

describe('server-side API rate limit policy', () => {
  it('limits Copilot calls to 12 per user per minute', () => {
    expect(API_RATE_LIMITS.copilot).toEqual({ maxRequests: 12, windowSeconds: 60 });
  });

  it('limits CSV imports to 5 per user per hour', () => {
    expect(API_RATE_LIMITS.csvImport).toEqual({ maxRequests: 5, windowSeconds: 3600 });
  });

  it('limits Checkout and billing portal session creation', () => {
    expect(API_RATE_LIMITS.checkout.maxRequests).toBe(5);
    expect(API_RATE_LIMITS.billingPortal.maxRequests).toBe(10);
  });

  it('limits CFO Brief generation to 5 per user per five minutes', () => {
    expect(API_RATE_LIMITS.cfoBrief).toEqual({ maxRequests: 5, windowSeconds: 300 });
  });

  it('allows only one destructive workspace deletion attempt per day', () => {
    expect(API_RATE_LIMITS.workspaceDeletion).toEqual({ maxRequests: 1, windowSeconds: 86_400 });
  });
});
