import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptConnectionSecret } from '@/lib/connection-encryption';
import { getPowensConfig, syncPowensConnection, getPowensConnection } from '@/lib/powens';

export const runtime = 'nodejs';
export const maxDuration = 60;

function normalizeTransactions(transactions: Record<string, unknown>[], organizationId: string) {
  return transactions.flatMap((transaction) => {
    const amount = Number(transaction.value);
    const date = typeof transaction.date === 'string' ? transaction.date
      : typeof transaction.application_date === 'string' ? transaction.application_date : '';
    const transactionId = String(transaction.id ?? '');
    if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !transactionId) return [];
    const categories = Array.isArray(transaction.categories) ? transaction.categories as Array<Record<string, unknown>> : [];
    const rawCategory = typeof categories[0]?.code === 'string' ? categories[0].code
      : typeof transaction.type === 'string' ? transaction.type : 'uncategorised';
    const category = rawCategory.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'uncategorised';
    const currency = typeof transaction.original_currency === 'string' ? transaction.original_currency
      : typeof transaction.currency === 'string' ? transaction.currency : 'EUR';
    return [{
      organization_id: organizationId,
      period: date,
      metric_key: (amount >= 0 ? 'inflow:' : 'outflow:') + category,
      amount: amount >= 0 ? Math.abs(amount) : -Math.abs(amount),
      currency: currency.trim().toUpperCase().slice(0, 3),
      source: 'powens',
      source_reference: 'powens:' + transactionId,
    }];
  });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: secret ? 'Unauthorized' : 'CRON_SECRET is not configured' }, { status: secret ? 401 : 503 });
  }
  const config = getPowensConfig();
  if (!config) return NextResponse.json({ skipped: true, reason: 'Powens credentials are not configured' });
  if (!process.env.AVENOR_CONNECTION_ENCRYPTION_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Secure bank synchronization is not configured' }, { status: 503 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: connections, error } = await admin.from('financial_connections')
      .select('id,organization_id,provider_connection_id')
      .eq('provider', 'powens').in('status', ['connected','action_required']).limit(100);
    if (error) throw new Error('Could not load bank connections');

    let synchronized = 0, failed = 0, imported = 0;
    for (const connection of connections ?? []) {
      try {
        const { data: credential, error: credentialError } = await admin.from('financial_provider_credentials')
          .select('encrypted_access_token').eq('organization_id', connection.organization_id).eq('provider','powens').maybeSingle();
        if (credentialError || !credential) throw new Error('Secure provider credential is unavailable');
        const token = decryptConnectionSecret(credential.encrypted_access_token);
        await admin.from('financial_connections').update({ status:'syncing', last_sync_error:null, updated_at:new Date().toISOString() }).eq('id',connection.id);

        const result = await syncPowensConnection(config, token, connection.provider_connection_id);
        const providerConnection = await getPowensConnection(config, token, connection.provider_connection_id) as {
          accounts?: Array<Record<string, unknown>>; state?: string | null;
        };
        const records = normalizeTransactions(result.transactions, connection.organization_id);
        for (let offset = 0; offset < records.length; offset += 500) {
          const { error: insertError } = await admin.from('financial_actuals').upsert(records.slice(offset, offset + 500), {
            onConflict:'organization_id,period,metric_key,source_reference',
          });
          if (insertError) throw new Error('Could not store synchronized bank transactions');
        }

        const accounts = result.accounts;
        const currencies = [...new Set(accounts.map((account) => {
          const value = account.currency;
          if (typeof value === 'string') return value.toUpperCase();
          if (value && typeof value === 'object' && 'id' in value) return String((value as {id:unknown}).id).toUpperCase();
          if (value && typeof value === 'object' && 'code' in value) return String((value as {code:unknown}).code).toUpperCase();
          return '';
        }).filter(Boolean))];
        const { data: organization } = await admin.from('organizations').select('base_currency').eq('id',connection.organization_id).maybeSingle();
        const baseCurrency = String(organization?.base_currency ?? 'EUR').toUpperCase();
        const balances = accounts.filter((account) => currencies.length === 1 && currencies[0] === baseCurrency)
          .map((account) => Number(account.balance)).filter(Number.isFinite);
        if (accounts.length > 0 && currencies.length === 1 && currencies[0] === baseCurrency && balances.length === accounts.length) {
          await admin.from('financial_cash_positions').upsert({
            organization_id:connection.organization_id,
            balance:balances.reduce((sum,value)=>sum+value,0),
            as_of_date:new Date().toISOString().slice(0,10),
            currency:baseCurrency, source:'powens', updated_at:new Date().toISOString(),
          }, {onConflict:'organization_id'});
        }

        const status = providerConnection.state && providerConnection.state !== 'null' ? 'action_required' : 'connected';
        await admin.from('financial_connections').update({
          status, account_count:accounts.length, last_synced_at:new Date().toISOString(),
          last_sync_error:null, updated_at:new Date().toISOString(),
        }).eq('id',connection.id);
        imported += records.length; synchronized += 1;
      } catch (cause) {
        failed += 1;
        const message = cause instanceof Error ? cause.message : 'Scheduled synchronization failed';
        await admin.from('financial_connections').update({
          status:/sca|webauth|password|credential|otp|additional information/i.test(message) ? 'action_required' : 'error',
          last_sync_error:message.slice(0,300), updated_at:new Date().toISOString(),
        }).eq('id',connection.id);
      }
    }
    return NextResponse.json({ synchronized, failed, imported, checked:connections?.length ?? 0 });
  } catch {
    return NextResponse.json({ error:'Could not synchronize bank connections' }, { status:503 });
  }
}
