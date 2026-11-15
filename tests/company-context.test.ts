import { describe, expect, it } from 'vitest';
import {
  CompanyContextSchema,
  EMPTY_COMPANY_CONTEXT,
  companyContextCompletion,
  isCompanyContextComplete,
} from '../src/lib/company-context';

describe('persistent company context', () => {
  it('provides safe defaults for a new workspace', () => {
    expect(EMPTY_COMPANY_CONTEXT.businessModel).toBe('other');
    expect(EMPTY_COMPANY_CONTEXT.stage).toBe('idea');
    expect(EMPTY_COMPANY_CONTEXT.targetRunwayMonths).toBe(12);
    expect(EMPTY_COMPANY_CONTEXT.churnWatchThresholdPct).toBeNull();
    expect(companyContextCompletion(EMPTY_COMPANY_CONTEXT)).toBe(0);
  });

  it('measures useful profile completion without treating defaults as founder input', () => {
    const context = CompanyContextSchema.parse({
      productDescription: 'Cash management for early-stage startups',
      targetCustomer: 'European seed-stage founders',
      mainGoal: 'Reach sustainable growth',
      industry: 'B2B software',
      pricingModel: 'Monthly subscription',
    });
    expect(companyContextCompletion(context)).toBe(83);
    expect(isCompanyContextComplete(context)).toBe(true);
  });

  it('rejects out-of-range or oversized founder settings', () => {
    expect(() => CompanyContextSchema.parse({ targetRunwayMonths: 2 })).toThrow();
    expect(() => CompanyContextSchema.parse({ cacPaybackWatchMonths: 100 })).toThrow();
    expect(() => CompanyContextSchema.parse({ founderNotes: 'x'.repeat(1001) })).toThrow();
  });
});
