import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptConnectionSecret } from '@/lib/connection-encryption';
import { buildPowensConnectUrl, createPowensTemporaryCode, getPowensConfig } from '@/lib/powens';
import { randomBytes } from 'node:crypto';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await context.params;
    const { data: connection } = await supabase.from('financial_connections')
      .select('id,organization_id,provider_connection_id,status')
      .eq('id', id).maybeSingle();
    if (!connection) return NextResponse.json({ error: 'Financial connection not found' }, { status: 404 });

    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', connection.organization_id).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    if (!['action_required','error'].includes(connection.status)) return NextResponse.json({ error: 'This connection does not currently require reconnection' }, { status: 409 });

    const config = getPowensConfig();
    if (!config || !process.env.AVENOR_CONNECTION_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Bank reconnection is not configured' }, { status: 503 });
    }
    const admin = createSupabaseAdminClient();
    const { data: credential, error } = await admin.from('financial_provider_credentials')
      .select('encrypted_access_token').eq('organization_id', connection.organization_id).eq('provider','powens').maybeSingle();
    if (error || !credential) return NextResponse.json({ error: 'Secure provider credentials are unavailable' }, { status: 503 });

    const token = decryptConnectionSecret(credential.encrypted_access_token);
    const temporary = await createPowensTemporaryCode(config, token);
    const state = randomBytes(32).toString('hex');
    const inserted = await admin.from('financial_connection_states').insert({
      state, organization_id: connection.organization_id, user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (inserted.error) return NextResponse.json({ error: 'Could not initialize secure reconnection' }, { status: 503 });

    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    const callback = new URL('/api/connections/powens/callback', base).toString();
    const url = buildPowensConnectUrl(config, temporary.code, callback, state, connection.provider_connection_id);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : message || 'Could not start reconnection' }, { status: unauthenticated ? 401 : 503 });
  }
}
