import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPowensConfig, createPowensUser, createPowensTemporaryCode, buildPowensConnectUrl } from '@/lib/powens';
import { encryptConnectionSecret } from '@/lib/connection-encryption';
import { randomBytes } from 'node:crypto';

const StartSchema = z.object({ organizationId: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const organizationId = new URL(request.url).searchParams.get('organizationId');
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    const { data, error } = await supabase.from('financial_connections')
      .select('id,provider,provider_connection_id,institution_name,status,account_count,last_synced_at,last_sync_error,created_at')
      .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: 'Could not load financial connections' }, { status: 500 });
    const configured = Boolean(process.env.POWENS_DOMAIN && process.env.POWENS_CLIENT_ID && process.env.POWENS_CLIENT_SECRET
      && process.env.AVENOR_CONNECTION_ENCRYPTION_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
    return NextResponse.json({ connections: data ?? [], provider: 'powens', configured, scheduledSyncConfigured: Boolean(process.env.CRON_SECRET?.trim()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = StartSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid connection request' }, { status: 400 });
    const { organizationId } = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Only workspace finance roles can connect a data source' }, { status: 403 });

    const config = getPowensConfig();
    if (!config || !process.env.AVENOR_CONNECTION_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Bank connections are not configured yet. A Powens business account and server-side credentials are required.' }, { status: 503 });
    }
    const admin = createSupabaseAdminClient();
    let { data: credential, error: credentialError } = await admin.from('financial_provider_credentials')
      .select('provider_user_id,encrypted_access_token').eq('organization_id', organizationId).eq('provider', 'powens').maybeSingle();
    if (credentialError) throw new Error('Could not load the secure bank connection record');

    if (!credential) {
      const created = await createPowensUser(config);
      if (!created.auth_token || !created.id_user) throw new Error('The bank provider did not create a user session');
      const inserted = await admin.from('financial_provider_credentials').insert({
        organization_id: organizationId,
        provider: 'powens',
        provider_user_id: created.id_user,
        encrypted_access_token: encryptConnectionSecret(created.auth_token),
      }).select('provider_user_id,encrypted_access_token').single();
      if (inserted.error) {
        // A parallel first-time request may have inserted the credential. Read it back without exposing it.
        const retry = await admin.from('financial_provider_credentials').select('provider_user_id,encrypted_access_token')
          .eq('organization_id', organizationId).eq('provider', 'powens').maybeSingle();
        if (retry.error || !retry.data) throw new Error('Could not securely initialize the bank connection');
        credential = retry.data;
      } else credential = inserted.data;
    }

    const { decryptConnectionSecret } = await import('@/lib/connection-encryption');
    const token = decryptConnectionSecret(credential.encrypted_access_token);
    const temporary = await createPowensTemporaryCode(config, token);
    const state = randomBytes(32).toString('hex');
    const stateInsert = await admin.from('financial_connection_states').insert({
      state, organization_id: organizationId, user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateInsert.error) throw new Error('Could not initialize the secure connection redirect');
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
    const callback = new URL('/api/connections/powens/callback', base).toString();
    const url = buildPowensConnectUrl(config, temporary.code, callback, state);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : message || 'Could not start bank connection' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
