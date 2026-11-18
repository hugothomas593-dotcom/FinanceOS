import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

const UpdateSchema = z.object({
  organizationId: z.string().uuid(),
  enabled: z.boolean(),
  recipientEmail: z.string().trim().email().max(254),
  timezone: z.string().trim().min(3).max(80).default('Europe/Paris'),
});

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = new URL(request.url).searchParams.get('organizationId') ?? '';
    if (!z.string().uuid().safeParse(organizationId).success) return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    const { data, error } = await supabase.from('weekly_report_preferences')
      .select('enabled,recipient_email,timezone,updated_at')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load weekly report settings' }, { status: 500 });
    return NextResponse.json({
      preference: data ?? { enabled: false, recipient_email: user.email ?? '', timezone: 'Europe/Paris', updated_at: null },
      accountEmail: user.email ?? '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid weekly report settings', details: parsed.error.flatten() }, { status: 400 });
    const p = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', p.organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    const { data, error } = await supabase.from('weekly_report_preferences').upsert({
      organization_id: p.organizationId, user_id: user.id,
      recipient_email: p.recipientEmail, enabled: p.enabled, timezone: p.timezone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' }).select('enabled,recipient_email,timezone,updated_at').single();
    if (error) return NextResponse.json({ error: 'Could not save weekly report settings. Check that the workspace subscription is active.' }, { status: 500 });
    return NextResponse.json({ preference: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
