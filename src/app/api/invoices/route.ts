import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const InvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  direction: z.enum(['receivable','payable']),
  category: z.enum(['revenue','cogs','payroll','opex','other']).default('other'),
  invoiceNumber: z.string().trim().max(80).optional().nullable(),
  counterparty: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCashDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  amount: z.number().finite().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/).default('EUR'),
  includedInModel: z.boolean().default(true),
});

async function authorize(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], organizationId: string, userId: string) {
  const { data: member } = await supabase.from('organization_members').select('role')
    .eq('organization_id', organizationId).eq('user_id', userId).maybeSingle();
  if (!member) return { allowed: false, role: null };
  return { allowed: ['owner','admin','finance'].includes(member.role), role: member.role };
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
    if (!z.string().uuid().safeParse(organizationId).success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    const { data, error } = await supabase.from('financial_invoices')
      .select('id,direction,category,invoice_number,counterparty,description,issue_date,due_date,expected_cash_date,amount,currency,included_in_model,status,paid_at,created_at,updated_at')
      .eq('organization_id', organizationId).order('due_date', { ascending: true }).limit(1_000);
    if (error) return NextResponse.json({ error: 'Could not load invoices and commitments' }, { status: 500 });
    return NextResponse.json({ invoices: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = InvoiceSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid invoice or commitment details', details: parsed.error.flatten() }, { status: 400 });
    const p = parsed.data;
    const permission = await authorize(supabase, p.organizationId, user.id);
    if (!permission.allowed) return NextResponse.json({ error: permission.role ? 'Insufficient permissions' : 'Workspace access denied' }, { status: 403 });
    const { data: organization } = await supabase.from('organizations').select('base_currency').eq('id', p.organizationId).maybeSingle();
    if (!organization) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    const row = {
      organization_id: p.organizationId, direction: p.direction, category: p.category,
      invoice_number: p.invoiceNumber || null, counterparty: p.counterparty,
      description: p.description || null, issue_date: p.issueDate || null,
      due_date: p.dueDate, expected_cash_date: p.expectedCashDate || p.dueDate,
      amount: p.amount, currency: p.currency.toUpperCase(),
      included_in_model: p.category === 'other' ? false : p.includedInModel,
      created_by: user.id,
    };
    const { data, error } = await supabase.from('financial_invoices').insert(row)
      .select('id,direction,category,invoice_number,counterparty,description,issue_date,due_date,expected_cash_date,amount,currency,included_in_model,status,paid_at,created_at,updated_at').single();
    if (error) return NextResponse.json({ error: 'Could not save invoice' }, { status: 500 });
    await supabase.from('audit_events').insert({
      organization_id: p.organizationId, actor_id: user.id, event_type: 'financial_invoice.created',
      entity_type: 'financial_invoice', entity_id: data.id,
      after_state: { direction: data.direction, due_date: data.due_date, amount: data.amount, currency: data.currency },
    });
    return NextResponse.json({ invoice: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
