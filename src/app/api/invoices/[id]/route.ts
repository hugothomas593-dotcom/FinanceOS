import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const PatchSchema = z.object({
  status: z.enum(['open','paid','void']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedCashDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amount: z.number().finite().positive().max(1_000_000_000).optional(),
  counterparty: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await context.params;
    const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid invoice update' }, { status: 400 });
    const { data: existing } = await supabase.from('financial_invoices').select('id,organization_id')
      .eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', existing.organization_id).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    const p = parsed.data;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (p.status) {
      update.status = p.status;
      update.paid_at = p.status === 'paid' ? new Date().toISOString().slice(0, 10) : null;
    }
    if (p.dueDate) update.due_date = p.dueDate;
    if (p.expectedCashDate !== undefined) update.expected_cash_date = p.expectedCashDate;
    if (p.amount !== undefined) update.amount = p.amount;
    if (p.counterparty) update.counterparty = p.counterparty;
    if (p.description !== undefined) update.description = p.description;
    const { data, error } = await supabase.from('financial_invoices').update(update).eq('id', id)
      .select('id,direction,category,invoice_number,counterparty,description,issue_date,due_date,expected_cash_date,amount,currency,included_in_model,status,paid_at,created_at,updated_at').single();
    if (error) return NextResponse.json({ error: 'Could not update invoice' }, { status: 500 });
    return NextResponse.json({ invoice: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await context.params;
    const { data: existing } = await supabase.from('financial_invoices').select('id,organization_id,status')
      .eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', existing.organization_id).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    if (existing.status === 'paid') return NextResponse.json({ error: 'Paid invoices cannot be deleted; mark corrections through your source accounting system' }, { status: 409 });
    const { error } = await supabase.from('financial_invoices').delete().eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not delete invoice' }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
