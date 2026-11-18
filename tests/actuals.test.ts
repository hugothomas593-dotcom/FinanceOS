import { describe, expect, it } from 'vitest';
import { createStableActualReferences } from '../src/lib/actuals';
import { normalizeActuals, type ImportedActual } from '../src/lib/csv';

const rows: ImportedActual[] = [
  { period: '2026-01-01', category: 'Sales', description: 'Invoice 1001', amount: 120.5, direction: 'inflow', source: 'bank.csv' },
  { period: '2026-01-02', category: 'Payroll', description: 'January payroll', amount: 30, direction: 'outflow', source: 'bank.csv' },
];

describe('European CSV import formats', () => {
  it('parses semicolon-separated files with decimal commas, thousands and quoted semicolons', () => {
    const imported = normalizeActuals(
      [
        'Date;Amount;Description;Category',
        '2026-02-01;1 234,56;"Client; invoice";Sales',
        '2026-02-02;-2 345,67;Paie;Payroll',
      ].join('\n'),
      'banque.csv',
    );

    expect(imported).toEqual([
      {
        period: '2026-02-01',
        category: 'Sales',
        description: 'Client; invoice',
        amount: 1234.56,
        direction: 'inflow',
        source: 'banque.csv',
      },
      {
        period: '2026-02-02',
        category: 'Payroll',
        description: 'Paie',
        amount: 2345.67,
        direction: 'outflow',
        source: 'banque.csv',
      },
    ]);
  });

  it('keeps comma-separated CSV compatibility, including a quoted decimal comma', () => {
    const imported = normalizeActuals(
      'Date,Amount,Description\n2026-03-01,"123,45",Invoice',
    );
    expect(imported[0].amount).toBe(123.45);
    expect(imported[0].direction).toBe('inflow');
  });

  it('supports tab-separated exports', () => {
    const imported = normalizeActuals(
      'Date\tAmount\tDescription\n2026-03-02\t-42.50\tSoftware',
    );
    expect(imported[0].amount).toBe(42.5);
    expect(imported[0].direction).toBe('outflow');
  });
});

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

  it('includes the actual row currency in the stable import reference', () => {
    const eur = [{ ...rows[0], currency: 'EUR' }];
    const gbp = [{ ...rows[0], currency: 'GBP' }];
    expect(createStableActualReferences('org-1', 'EUR', eur))
      .not.toEqual(createStableActualReferences('org-1', 'EUR', gbp));
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
