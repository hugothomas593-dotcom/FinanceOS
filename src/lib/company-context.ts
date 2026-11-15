import { z } from 'zod';

export const CompanyContextSchema = z.object({
  industry: z.string().trim().max(100).default(''),
  businessModel: z.enum(['saas', 'marketplace', 'services', 'ecommerce', 'hardware', 'other']).default('other'),
  stage: z.enum(['idea', 'pre-seed', 'seed', 'series-a', 'series-b', 'profitable', 'other']).default('idea'),
  productDescription: z.string().trim().max(600).default(''),
  targetCustomer: z.string().trim().max(300).default(''),
  geography: z.string().trim().max(160).default(''),
  pricingModel: z.string().trim().max(160).default(''),
  mainGoal: z.string().trim().max(240).default(''),
  nextMilestone: z.string().trim().max(240).default(''),
  targetRunwayMonths: z.number().int().min(3).max(36).default(12),
  churnWatchThresholdPct: z.number().min(0).max(100).nullable().default(null),
  cacPaybackWatchMonths: z.number().min(0.1).max(60).nullable().default(null),
  founderNotes: z.string().trim().max(1_000).default(''),
}).strict();

export type CompanyContext = z.infer<typeof CompanyContextSchema>;

export const EMPTY_COMPANY_CONTEXT: CompanyContext = CompanyContextSchema.parse({});

export function companyContextCompletion(context: CompanyContext): number {
  const completed = [
    Boolean(context.industry),
    Boolean(context.productDescription),
    Boolean(context.targetCustomer),
    Boolean(context.pricingModel),
    Boolean(context.geography),
    Boolean(context.mainGoal),
  ].filter(Boolean).length;
  return Math.round((completed / 6) * 100);
}

export function isCompanyContextComplete(context: CompanyContext): boolean {
  return companyContextCompletion(context) >= 80;
}
