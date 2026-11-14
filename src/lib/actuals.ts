import { createHash } from 'node:crypto';
import type { ImportedActual } from './csv';

/**
 * Creates deterministic per-row references so re-importing the same transaction
 * into the same workspace is idempotent. Occurrence counters preserve genuinely
 * repeated identical transactions within one CSV file.
 */
export function createStableActualReferences(
  organizationId: string,
  currency: string,
  actuals: ImportedActual[],
): string[] {
  const occurrences = new Map<string, number>();
  const normalizedCurrency = currency.trim().toUpperCase();

  return actuals.map((actual) => {
    const metricKey = `${actual.direction}:${actual.category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const identity = JSON.stringify({
      organizationId,
      currency: normalizedCurrency,
      period: actual.period,
      metricKey,
      amount: actual.direction === 'inflow' ? actual.amount : -actual.amount,
      description: actual.description.trim(),
    });
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    const digest = createHash('sha256')
      .update(`${identity}:${occurrence}`)
      .digest('hex');
    return `csv:${digest}`;
  });
}
