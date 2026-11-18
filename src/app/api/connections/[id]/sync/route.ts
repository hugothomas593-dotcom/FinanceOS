import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptConnectionSecret } from '@/lib/connection-encryption';
import { getPowensConfig, syncPowensConnection, getPowensConnection } from '@/lib/powens';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await context.params;
    const { data: connection, error: connectionError } = await supabase.from('financial_connections')
      .select('id,organization_id,provider_connection_id,status')
      .eq('id', id).maybeSingle();
    if (connectionError || !connection) return NextResponse.json({ error: 'Financial connection not found' }, { status: 404 });
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', connection.organization_id).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    if (!['owner','admin','finance'].includes(member.role)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

    const config = getPowensConfig();
    if (!config) return NextResponse.json({ error: 'Bank connections are not configured' }, { status: 503 });
    const admin = createSupabaseAdminClient();
    const { data: credential, error: credentialError } = await admin.from('financial_provider_credentials')
      .select('encrypted_access_token').eq('organization_id', connection.organization_id).eq('provider', 'powens').maybeSingle();
    if (credentialError || !credential) return NextResponse.json({ error: 'Secure provider credentials are unavailable' }, { status: 503 });
    const token = decryptConnectionSecret(credential.encrypted_access_token);

    await supabase.from('financial_connections').update({ status: 'syncing', last_sync_error: null, updated_at: new Date().toISOString() }).eq('id', id);
    try {
      const synced = await syncPowensConnection(config, token, connection.provider_connection_id);
      const rawConnection = await getPowensConnection(config, token, connection.provider_connection_id) as {
        accounts?: Array<Record<string, unknown>>;
        state?: string | null;
      };
      const records = synced.transactions.flatMap((transaction) => {
        const amount = Number(transaction.value);
        const date = typeof transaction.date === 'string' ? transaction.date
          : typeof transaction.application_date === 'string' ? transaction.application_date : '';
        if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
        const categories = Array.isArray(transaction.categories) ? transaction.categories as Array<Record<string, unknown>> : [];
        const providerCategory = typeof categories[0]?.code === 'string' ? categories[0].code
          : typeof transaction.type === 'string' ? transaction.type : 'uncategorised';
        const category = providerCategory.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'uncategorised';
        const transactionId = String(transaction.id ?? '');
        if (!transactionId) return [];
        const currency = typeof transaction.original_currency === 'string' ? transaction.original_currency
          : typeof transaction.currency === 'string' ? transaction.currency : 'EUR';
        return [{
          organization_id: connection.organization_id,
          period: date,
          metric_key: (amount >= 0 ? 'inflow:' : 'outflow:') + category,
          amount: amount >= 0 ? Math.abs(amount) : -Math.abs(amount),
          currency: currency.trim().toUpperCase().slice(0, 3),
          source: 'powens',
          source_reference: 'powens:' + transactionId,
        }];
      });

      let inserted = 0;
      for (let offset = 0; offset < records.length; offset += 500) {
        const { data, error } = await supabase.from('financial_actuals').upsert(records.slice(offset, offset + 500), {
          onConflict: 'organization_id,period,metric_key,source_reference',
        }).select('id');
        if (error) throw new Error('Could not store synchronized transactions');
        inserted += data?.length ?? 0;
      }

      const accounts = synced.accounts;
      const currencies = [...new Set(accounts.map((account) => {
        const value = account.currency;
        if (typeof value === 'string') return value.toUpperCase();
        if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id).toUpperCase();
        if (value && typeof value === 'object' && 'code' in value) return String((value as { code: unknown }).code).toUpperCase();
        return '';
      }).filter(Boolean))];
      const { data: organization } = await supabase.from('organizations').select('base_currency').eq('id', connection.organization_id).maybeSingle();
      const baseCurrency = String(organization?.base_currency ?? 'EUR').toUpperCase();
      const balances = accounts.filter((account) => currencies.length === 1 && currencies[0] === baseCurrency)
        .map((account) => Number(account.balance)).filter(Number.isFinite);
      let bankBalanceUpdated = false;
      if (currencies.length === 1 && currencies[0] === baseCurrency && balances.length === accounts.length && balances.length > 0) {
        const balance = balances.reduce((sum, value) => sum + value, 0);
        const { error } = await supabase.from('financial_cash_positions').upsert({
          organization_id: connection.organization_id,
          balance,
          as_of_date: new Date().toISOString().slice(0, 10),
          currency: baseCurrency,
          source: 'powens',
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });
        bankBalanceUpdated = !error;
      }

      const finalStatus = rawConnection.state && rawConnection.state !== 'null' ? 'action_required' : 'connected';
      await supabase.from('financial_connections').update({
        status: finalStatus,
        account_count: accounts.length,
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      await supabase.from('audit_events').insert({
        organization_id: connection.organization_id, actor_id: user.id,
        event_type: 'financial_connection.synced', entity_type: 'financial_connection',
        entity_id: id, after_state: { provider: 'powens', imported_records: records.length, account_count: accounts.length },
      });
      return NextResponse.json({
        synced: true, importedTransactions: records.length, accounts: accounts.length,
        bankBalanceUpdated, excludedCurrencyAccounts: currencies.length > 1 || (currencies.length === 1 && currencies[0] !== baseCurrency),
        truncated: synced.truncated,
      });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Bank synchronization failed';
      const actionRequired = /sca|webauth|password|credential|otp|additional information/i.test(message);
      await supabase.from('financial_connections').update({
        status: actionRequired ? 'action_required' : 'error',
        last_sync_error: message.slice(0, 300),
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      return NextResponse.json({ error: message, actionRequired }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required' : 'Service unavailable' }, { status: unauthenticated ? 401 : 503 });
  }
}
