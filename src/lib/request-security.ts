/**
 * Lightweight CSRF protection for cookie-authenticated mutating API requests.
 * Webhooks are excluded because they authenticate with Stripe signatures instead.
 */
export function isSameOriginMutation(request: Request): boolean {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = (forwardedHost || request.headers.get('host') || requestUrl.host).toLowerCase();
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const protocol = (forwardedProto || requestUrl.protocol.replace(':', '')).toLowerCase();
    return originUrl.host.toLowerCase() === host && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
