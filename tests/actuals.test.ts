import { describe, expect, it } from 'vitest';
import { createStableActualReferences } from '../src/lib/actuals';
import type { ImportedActual } from '../src/lib/csv';

const rows: ImportedActual[] = [
  { period: '2026-01-01', category: 'Sales', description: 'Invoice 1001', amount: 120.5, direction: 'inflow', source: 'bank.csv' },
  { period: '2026-01-02', category: 'Payroll', description: 'January payroll', amount: 30, direction: 'outflow', source: 'bank.csv' },
];

describe('stable CSV import references', () => {
  it('returns identical references for a repeated import', () => {
    expect(createStableActualReferences('org-1', 'EUR', rows))
      .toEqual(createStableActualReferences('org-1', 'EUR', rows));
  });

  it('keeps references independent of file names', () => {
    const renamed = rows.map((row) => ({ ...row, source: 'different-name.csv' }));
    expect(createStableActualReferences('org-1', 'EUR', rows))
      .toEqual(createStableActualReferences('org-1', 'EUR', renamed));
  });

  it('creates different references for different organizations or currencies', () => {
    expect(createStableActualReferences('org-1', 'EUR', rows))
      .not.toEqual(createStableActualReferences('org-2', 'EUR', rows));
    expect(createStableActualReferences('org-1', 'EUR', rows))
      .not.toEqual(createStableActualReferences('org-1', 'GBP', rows));
  });

  it('preserves repeated identical transactions as separate rows', () => {
    const references = createStableActualReferences('org-1', 'EUR', [rows[0], rows[0]]);
    expect(references[0]).not.toBe(references[1]);
    expect(new Set(references).size).toBe(2);
  });
});
