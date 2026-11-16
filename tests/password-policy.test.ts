import { describe, expect, it } from 'vitest';
import { meetsMinimumPasswordPolicy } from '../src/lib/password-policy';

describe('Avenor sign-up password guidance', () => {
  it('accepts a 12+ character password with lower, upper, numeric and symbol characters', () => {
    expect(meetsMinimumPasswordPolicy('StrongPassw0rd!')).toBe(true);
  });

  it.each([
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
