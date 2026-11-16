import { describe, expect, it } from 'vitest';
import { isSameOriginMutation } from '../src/lib/request-security';

describe('same-origin mutation protection', () => {
  it('accepts a same-origin browser request', () => {
    const request = new Request('https://avenor.example/api/models', {
      method: 'POST',
      headers: {
        origin: 'https://avenor.example',
        host: 'avenor.example',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(isSameOriginMutation(request)).toBe(true);
  });

  it('rejects a cross-origin Origin header', () => {
    const request = new Request('https://avenor.example/api/models', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'avenor.example',
        'sec-fetch-site': 'cross-site',
      },
    });
    expect(isSameOriginMutation(request)).toBe(false);
  });

  it('rejects a cross-site Fetch Metadata request even without Origin', () => {
    const request = new Request('https://avenor.example/api/models', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(isSameOriginMutation(request)).toBe(false);
  });

  it('accepts non-browser server requests without Origin or Fetch Metadata', () => {
    const request = new Request('https://avenor.example/api/models', { method: 'POST' });
    expect(isSameOriginMutation(request)).toBe(true);
  });

  it('uses the forwarded host and protocol for a proxied deployment', () => {
    const request = new Request('https://internal.example/api/models', {
      method: 'POST',
      headers: {
        origin: 'https://preview.avenor.example',
        host: 'internal.example',
        'x-forwarded-host': 'preview.avenor.example',
        'x-forwarded-proto': 'https',
      },
    });
    expect(isSameOriginMutation(request)).toBe(true);
  });
});
