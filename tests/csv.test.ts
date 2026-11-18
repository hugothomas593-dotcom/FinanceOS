import { describe, expect, it } from 'vitest';
import { normalizeActuals, parseCsv } from '../src/lib/csv';

describe('CSV import', () => {
  it('parses quoted commas and escaped quotes', () => { expect(parseCsv('Date,Description,Amount\n2026-01-01,"Cloud, hosting",-12\n2026-01-02,"A ""quoted"" item",20')[1][1]).toBe('Cloud, hosting'); });
  it('normalizes ISO date rows and direction', () => { const rows = normalizeActuals('Date,Amount,Category\n2026-01-01,120.50,Sales\n2026-01-02,-30.00,Payroll'); expect(rows[0].direction).toBe('inflow'); expect(rows[1].amount).toBe(30); expect(rows[1].direction).toBe('outflow'); });
  it('supports European decimal comma and thousands separator', () => { expect(normalizeActuals('Date,Amount\n2026-01-01,"1.234,56"')[0].amount).toBe(1234.56); });
  it('imports French debit/credit bank exports with day-first dates and accented headers', () => {
    const rows = normalizeActuals(
      [
        'Date opération;Débit;Crédit;Libellé;Catégorie;Devise',
        '16/11/2026;1 234,56;;"Fournisseur; bureau";Frais;EUR',
        '17/11/2026;;2 500,00;Paiement client;Ventes;GBP',
      ].join('\n'),
      'releve-fr.csv',
    );

    expect(rows).toEqual([
      {
        period: '2026-11-16',
        category: 'Frais',
        description: 'Fournisseur; bureau',
        amount: 1234.56,
        direction: 'outflow',
        source: 'releve-fr.csv',
        currency: 'EUR',
      },
      {
        period: '2026-11-17',
        category: 'Ventes',
        description: 'Paiement client',
        amount: 2500,
        direction: 'inflow',
        source: 'releve-fr.csv',
        currency: 'GBP',
      },
    ]);
  });

  it('strips a UTF-8 BOM from the first header and keeps the workspace currency as an optional default', () => {
    const rows = normalizeActuals('\uFEFFDate;Montant\n01/12/2026;12,50');
    expect(rows[0].period).toBe('2026-12-01');
    expect(rows[0].amount).toBe(12.5);
    expect(rows[0].currency).toBeUndefined();
  });

  it('rejects invalid currency codes and rows with both debit and credit values', () => {
    expect(() => normalizeActuals('Date;Montant;Devise\n2026-11-01;12;EURO')).toThrow('three-letter currency code');
    expect(() => normalizeActuals('Date;Debit;Credit\n2026-11-01;12;5')).toThrow('both a debit and a credit');
  });

  it('rejects invalid dates, malformed quotes and inconsistent columns', () => { expect(() => normalizeActuals('Date,Amount\n2026-02-30,10')).toThrow(); expect(() => parseCsv('Date,Amount\n2026-01-01,"10')).toThrow(); expect(() => parseCsv('Date,Amount\n2026-01-01,10,extra')).toThrow(); });
});
