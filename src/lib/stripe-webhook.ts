import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  nowMs = Date.now(),
  toleranceSeconds = 300,
): boolean {
  const fields = signatureHeader.split(',').map((part) => part.trim().split('='));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));

  if (!timestamp || timestamp.length === 0 || [...timestamp].some((character) => character < '0' || character > '9') || !signatures.length || !webhookSecret) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(nowMs / 1000 - timestampSeconds) > toleranceSeconds) return false;

  const expected = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest();

  return signatures.some((value) => {
    if (!/^[a-f0-9]{64}$/i.test(value)) return false;
    const received = Buffer.from(value, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
