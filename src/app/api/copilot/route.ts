import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { forecast, summarize, validateModelInputs, type ModelInputs, type HireInput } from '@/lib/finance';

const RequestSchema = z.object({
  organizationId: z.string().uuid(),
  question: z.string().trim().min(3).max(2000),
  hire: z.object({ headcount: z.number().int().min(1).max(500), startMonth: z.number().int().min(0).max(35), grossAnnualSalary: z.number().nonnegative(), employerCostRate: z.number().min(0).max(3), benefitsMonthlyPerPerson: z.number().nonnegative(), recruitingCostPerPerson: z.number().nonnegative(), equipmentCostPerPerson: z.number().nonnegative(), productivityRampMonths: z.number().int().min(0).max(36) }).optional()
});

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    const { organizationId, question, hire } = parsed.data;
    const { data: membership } = await supabase.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });

    // Copilot invokes a paid model provider when configured; enforce the shared
    // Postgres-backed per-user limit before doing any forecast or AI work.
    let rateLimit;
    try {
      rateLimit = await enforceApiRateLimit(user.id, 'copilot');
    } catch {
      return NextResponse.json({ error: 'Copilot is temporarily unavailable. Please try again shortly.' }, { status: 503 });
    }
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many Copilot requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const { data: approvedModel } = await supabase.from('model_versions').select('assumptions').eq('organization_id', organizationId).eq('status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const modelInputs = approvedModel?.assumptions as ModelInputs | undefined;
    if (!modelInputs) return NextResponse.json({ answer: 'I need an approved financial model before I can calculate a reliable answer. Add your company assumptions and approve a model version first.', evidence: [], needsData: true });
    try { validateModelInputs(modelInputs); } catch { return NextResponse.json({ error: 'The approved financial model contains invalid assumptions. Review and approve a corrected version.' }, { status: 422 }); }
    const base = forecast(modelInputs, [], 18);
    const modeled = forecast(modelInputs, hire ? [hire as HireInput] : [], 18);
    const baseSummary = summarize(base); const scenarioSummary = summarize(modeled);
    const evidence = [
      { label: 'Opening cash', value: modelInputs.openingCash, source: 'User-provided model assumptions' },
      { label: 'Monthly revenue', value: modelInputs.monthlyRevenue, source: 'User-provided model assumptions' },
      { label: 'Monthly payroll', value: modelInputs.existingMonthlyPayroll, source: 'User-provided model assumptions' },
      { label: 'Forecast horizon', value: '18 months', source: 'Avenor deterministic model' }
    ];
    const facts = { baseCase: baseSummary, modeledScenario: scenarioSummary, monthOneNetCashFlow: modeled[0].netCashFlow, monthEighteenCash: scenarioSummary.endingCash, hiringIncluded: Boolean(hire) };
    let explanation = `Based on the assumptions supplied, projected cash at month 18 is ${Math.round(scenarioSummary.endingCash).toLocaleString('en-GB')} EUR. The base case is ${Math.round(baseSummary.endingCash).toLocaleString('en-GB')} EUR. `;
    if (hire) explanation += `The hiring scenario adds ${hire.headcount} people from forecast month ${hire.startMonth + 1}; the model includes salary, employer-cost assumption, benefits, recruitment and equipment. It assumes no automatic revenue uplift from the hires. `;
    explanation += scenarioSummary.firstMonthBelowSixMonthsRunway ? `The modeled monthly burn implies less than six months of runway in forecast month ${scenarioSummary.firstMonthBelowSixMonthsRunway}.` : 'The model does not identify a month below six months of runway using its monthly net-burn calculation.';
    if (process.env.OPENAI_API_KEY) {
      try {
        const ai = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', input: [{ role: 'system', content: 'You are Avenor, a careful startup finance analyst. Explain only the supplied deterministic results and evidence. Never invent data, tax rules or recommendations. Clearly distinguish assumptions from facts. Do not claim certainty.' }, { role: 'user', content: JSON.stringify({ question, facts, evidence }) }], max_output_tokens: 500 }), signal: AbortSignal.timeout(15000) });
        if (ai.ok) {
          const payload = await ai.json();
          const output = payload.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((c: { type: string }) => c.type === 'output_text').map((c: { text?: string }) => c.text).join('\n');
          if (output) explanation = output;
        }
      } catch { /* deterministic explanation remains available if the AI provider is unavailable */ }
    }
    return NextResponse.json({ answer: explanation, facts, evidence, disclaimer: 'Forecast only. Results depend on the supplied assumptions and are not accounting, tax, legal or investment advice.' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Copilot is temporarily unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
