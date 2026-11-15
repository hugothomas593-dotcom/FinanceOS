import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CompanyContextSchema, EMPTY_COMPANY_CONTEXT } from '@/lib/company-context';
import { requireUser } from '@/lib/supabase/server';

const OrganizationId = z.string().uuid();

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = OrganizationId.safeParse(new URL(request.url).searchParams.get('organizationId'));
    if (!organizationId.success) {
      return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId.data)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const { data, error } = await supabase
      .from('organization_contexts')
      .select('context,updated_at')
      .eq('organization_id', organizationId.data)
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Could not load company context' }, { status: 500 });

    const parsed = CompanyContextSchema.safeParse(data?.context ?? EMPTY_COMPANY_CONTEXT);
    return NextResponse.json({
      context: parsed.success ? parsed.data : EMPTY_COMPANY_CONTEXT,
      updatedAt: data?.updated_at ?? null,
      hasSavedContext: Boolean(data),
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const payload = z.object({
      organizationId: OrganizationId,
      context: CompanyContextSchema,
    }).strict().safeParse(await request.json().catch(() => null));

    if (!payload.success) {
      return NextResponse.json({ error: 'Invalid company context', details: payload.error.flatten() }, { status: 400 });
    }

    const { organizationId, context } = payload.data;
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) return NextResponse.json({ error: 'Could not verify workspace access' }, { status: 500 });
    if (!membership) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner', 'admin', 'finance'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only workspace owners, admins or finance members can update company context' }, { status: 403 });
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('organization_contexts')
      .upsert({
        organization_id: organizationId,
        context,
        updated_by: user.id,
        updated_at: updatedAt,
      }, { onConflict: 'organization_id' })
      .select('context,updated_at')
      .single();

    if (error || !data) return NextResponse.json({ error: 'Could not save company context' }, { status: 500 });

    await supabase.from('audit_events').insert({
      organization_id: organizationId,
      actor_id: user.id,
      event_type: 'organization_context.updated',
      entity_type: 'organization_context',
      after_state: {
        industry: context.industry || null,
        businessModel: context.businessModel,
        stage: context.stage,
        fieldsProvided: Object.entries(context).filter(([, value]) => value !== '' && value !== null).map(([key]) => key),
      },
    });

    return NextResponse.json({ context: data.context, updatedAt: data.updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
