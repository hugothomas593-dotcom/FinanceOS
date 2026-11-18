import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptConnectionSecret } from '@/lib/connection-encryption';
import { getPowensConfig, getPowensConnection } from '@/lib/powens';

function returnToApp(request: Request, status: string) {
  const url = new URL('/app', request.url);
  url.searchParams.set('bank', status);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const current = new URL(request.url);
  const state = current.searchParams.get('state') ?? '';
  const connectionId = current.searchParams.get('connection_id') ?? current.searchParams.get('id_connection') ?? '';
  const providerError = current.searchParams.get('error');

  let user;
  try {
    ({ user } = await requireUser());
  } catch {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', '/app');
    return NextResponse.redirect(login);
  }

  try {
    if (!/^[a-f0-9]{64}$/i.test(state)) return returnToApp(request, 'invalid-state');
    const admin = createSupabaseAdminClient();
    const { data: oauthState, error: stateError } = await admin.from('financial_connection_states')
      .select('state,organization_id,user_id,expires_at,used_at')
      .eq('state', state).maybeSingle();
    if (stateError || !oauthState || oauthState.user_id !== user.id || oauthState.used_at
      || new Date(oauthState.expires_at).getTime() < Date.now()) {
      return returnToApp(request, 'invalid-state');
    }

    await admin.from('financial_connection_states').update({ used_at: new Date().toISOString() }).eq('state', state);
    if (providerError) return returnToApp(request, providerError === 'access_denied' ? 'cancelled' : 'error');
    if (!/^\d+$/.test(connectionId)) return returnToApp(request, 'missing-connection');

    const config = getPowensConfig();
    if (!config) return returnToApp(request, 'not-configured');
    const { data: credential, error: credentialError } = await admin.from('financial_provider_credentials')
      .select('encrypted_access_token').eq('organization_id', oauthState.organization_id).eq('provider', 'powens').maybeSingle();
    if (credentialError || !credential) return returnToApp(request, 'credential-error');
    const token = decryptConnectionSecret(credential.encrypted_access_token);
    const providerConnection = await getPowensConnection(config, token, connectionId) as {
      state?: string | null;
      connector?: { name?: string };
      accounts?: Array<{ id?: number | string }>;
    };

    const status = providerConnection.state && providerConnection.state !== 'null' ? 'action_required' : 'connected';
    const { error: insertError } = await admin.from('financial_connections').upsert({
      organization_id: oauthState.organization_id,
      provider: 'powens',
      provider_connection_id: connectionId,
      institution_name: providerConnection.connector?.name || 'Connected bank',
      status,
      account_count: providerConnection.accounts?.length ?? 0,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,provider_connection_id' });
    if (insertError) throw new Error('Could not save the bank connection');
    return returnToApp(request, 'connected');
  } catch {
    return returnToApp(request, 'error');
  }
}
