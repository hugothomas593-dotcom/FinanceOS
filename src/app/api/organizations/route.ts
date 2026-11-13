import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
const Schema = z.object({ name: z.string().trim().min(2).max(100), countryCode: z.string().length(2).default('FR'), currency: z.string().length(3).default('EUR') });

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from('organization_members').select('organization_id,role,organizations(id,name,country_code,base_currency)').eq('user_id', user.id).order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: 'Could not load workspaces' }, { status: 500 });
    return NextResponse.json({ organizations: data ?? [] });
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    return NextResponse.json({ error: m === 'UNAUTHENTICATED' ? 'Authentication required' : 'Service unavailable' }, { status: m === 'UNAUTHENTICATED' ? 401 : 503 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireUser(); const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid organization details' }, { status: 400 });
    const { data, error } = await supabase.rpc('create_organization_with_owner', { org_name: parsed.data.name, country: parsed.data.countryCode, currency: parsed.data.currency });
    if (error) return NextResponse.json({ error: 'Could not create organization' }, { status: 400 });
    return NextResponse.json({ organizationId: data }, { status: 201 });
  } catch (e) { const m = e instanceof Error ? e.message : ''; return NextResponse.json({ error: m === 'UNAUTHENTICATED' ? 'Authentication required' : 'Service unavailable' }, { status: m === 'UNAUTHENTICATED' ? 401 : 503 }); }
}
