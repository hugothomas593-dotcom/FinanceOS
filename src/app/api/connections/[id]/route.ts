import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptConnectionSecret } from '@/lib/connection-encryption';
import { getPowensConfig, powensUserRequest } from '@/lib/powens';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
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

    if (connection.status !== 'disconnected') {
      const config = getPowensConfig();
      if (!config || !process.env.AVENOR_CONNECTION_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Bank disconnection is not configured' }, { status: 503 });
      }
      const admin = createSupabaseAdminClient();
      const { data: credential, error } = await admin.from('financial_provider_credentials')
        .select('encrypted_access_token').eq('organization_id', connection.organization_id).eq('provider','powens').maybeSingle();
      if (error || !credential) return NextResponse.json({ error: 'Secure provider credentials are unavailable' }, { status: 503 });
      const token = decryptConnectionSecret(credential.encrypted_access_token);
      await powensUserRequest(config, token, '/users/me/connections/' + encodeURIComponent(connection.provider_connection_id), { method: 'DELETE' });
    }

    const { error: updateError } = await supabase.from('financial_connections').update({
      status: 'disconnected', account_count: 0, last_sync_error: null, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (updateError) return NextResponse.json({ error: 'Provider connection removed but the local status could not be updated. Refresh the page.' }, { status: 500 });

    await supabase.from('audit_events').insert({
      organization_id: connection.organization_id, actor_id: user.id,
      event_type: 'financial_connection.disconnected', entity_type: 'financial_connection',
      entity_id: id, after_state: { provider: 'powens' },
    });
    return NextResponse.json({ disconnected: true, historicalTransactionsRetained: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : message || 'Could not disconnect bank' }, { status: unauthenticated ? 401 : 503 });
  }
}
