export type PowensConfig = { domain: string; clientId: string; clientSecret: string };

export function getPowensConfig(): PowensConfig | null {
  const domain = process.env.POWENS_DOMAIN?.trim();
  const clientId = process.env.POWENS_CLIENT_ID?.trim();
  const clientSecret = process.env.POWENS_CLIENT_SECRET?.trim();
  if (!domain || !clientId || !clientSecret) return null;
  if (!/^[a-z0-9-]+$/i.test(domain)) throw new Error('POWENS_DOMAIN must be the short domain name provided by Powens');
  return { domain, clientId, clientSecret };
}

function apiBase(config: PowensConfig) {
  return 'https://' + config.domain + '.biapi.pro/2.0';
}

async function parseJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage = typeof data?.message === 'string' ? data.message : typeof data?.error_description === 'string' ? data.error_description : '';
    throw new Error(providerMessage || 'Bank data provider request failed (' + response.status + ')');
  }
  return data;
}

export async function createPowensUser(config: PowensConfig) {
  const response = await fetch(apiBase(config) + '/auth/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    cache: 'no-store',
  });
  return parseJson(response) as Promise<{ auth_token: string; id_user: number; type: string }>;
}

export async function createPowensTemporaryCode(config: PowensConfig, userToken: string) {
  const response = await fetch(apiBase(config) + '/auth/token/code?type=singleAccess', {
    headers: { Authorization: 'Bearer ' + userToken },
    cache: 'no-store',
  });
  return parseJson(response) as Promise<{ code: string; type?: string; expires_in?: number }>;
}

export function buildPowensConnectUrl(config: PowensConfig, code: string, callbackUrl: string, state: string) {
  const url = new URL('https://webview.powens.com/fr/connect');
  url.searchParams.set('domain', config.domain + '.biapi.pro');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('code', code);
  url.searchParams.set('state', state);
  url.searchParams.set('connector_capabilities', 'bank');
  url.searchParams.set('account_types', 'checking');
  return url.toString();
}

export async function powensUserRequest(
  config: PowensConfig,
  userToken: string,
  pathOrUrl: string,
  init: RequestInit = {},
) {
  const base = apiBase(config);
  const url = pathOrUrl.startsWith('https://') ? new URL(pathOrUrl) : new URL(base + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl));
  const expectedHost = new URL(base).host;
  if (url.host !== expectedHost || url.protocol !== 'https:') throw new Error('Rejected unexpected bank provider URL');
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + userToken, Accept: 'application/json' },
    cache: 'no-store',
  });
  return parseJson(response);
}

export async function getPowensConnection(config: PowensConfig, token: string, connectionId: string) {
  return powensUserRequest(config, token, '/users/me/connections/' + encodeURIComponent(connectionId) + '?expand=connector,accounts');
}

export async function getPowensAccounts(config: PowensConfig, token: string) {
  return powensUserRequest(config, token, '/users/me/accounts?limit=1000');
}

export async function syncPowensConnection(config: PowensConfig, token: string, connectionId: string) {
  await powensUserRequest(config, token, '/users/me/connections/' + encodeURIComponent(connectionId) + '?psu_requested=true', { method: 'PUT' });
  const accountResponse = await getPowensAccounts(config, token) as { accounts?: Record<string, unknown>[] };
  const transactions: Record<string, unknown>[] = [];
  let next: string | null = '/users/me/transactions?limit=1000&min_date=' + encodeURIComponent(
    new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  let pages = 0;
  while (next && pages < 10) {
    const result = await powensUserRequest(config, token, next) as {
      transactions?: Record<string, unknown>[];
      _links?: { next?: { href?: string | null } | null };
    };
    transactions.push(...(result.transactions ?? []));
    next = result._links?.next?.href ?? null;
    pages += 1;
  }
  return { accounts: accountResponse.accounts ?? [], transactions, pagesFetched: pages, truncated: Boolean(next) };
}
