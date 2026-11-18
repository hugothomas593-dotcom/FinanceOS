import { describe, expect, it } from 'vitest';
import { meetsMinimumPasswordPolicy } from '../src/lib/password-policy';

describe('Avenor account password policy', () => {
  it('accepts the 12-character minimum with lowercase, uppercase, a number and a symbol', () => {
    expect(meetsMinimumPasswordPolicy('Abcdefghij1!')).toBe(true);
  });

  it('accepts a longer password with lowercase, uppercase, a number and a symbol', () => {
    expect(meetsMinimumPasswordPolicy('StrongPassw0rd!')).toBe(true);
  });

  it.each([
    'Abcdefghi1!',
    'Short1!',
    'alllowercase123!',
    'ALLUPPERCASE123!',
    'NoNumbersHere!!',
    'NoSymbolsHere123',
    'éééééééééééé',
  ])('rejects a password that misses the minimum strength policy', (password) => {
    expect(meetsMinimumPasswordPolicy(password)).toBe(false);
  });
});
