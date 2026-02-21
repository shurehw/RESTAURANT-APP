/**
 * Oracle Simphony Business Intelligence API Client
 *
 * Provides direct access to Simphony POS data for venues using Oracle MICROS
 * Simphony (e.g. Dallas). Bypasses TipSee's batch sync for live intra-day data.
 *
 * Auth: OAuth2 + PKCE flow (authorize → signin → token exchange).
 * Data: ~90 second latency from POS transaction → BI cloud.
 *
 * Reference: https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/
 */

import crypto from 'crypto';

const REQUEST_TIMEOUT_MS = 15_000;

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface SimphonyBIConfig {
  authServer: string;   // e.g. https://ors-idm.us07.oraclerestaurants.com
  appServer: string;    // e.g. https://simphony-home.us07.oraclerestaurants.com
  clientId: string;
  orgIdentifier: string; // Enterprise Short Name, e.g. 'HWG'
}

export interface SimphonyTokenSet {
  id_token: string;
  refresh_token: string;
  access_token: string;
  expires_in: number; // seconds (1209600 = 14 days)
}

export interface SimphonyRevenueCenterTotals {
  rvcNum: number;
  netSlsTtl?: number;
  chkCnt?: number;
  gstCnt?: number;
  vdTtl?: number;
  vdCnt?: number;
  mngrVdTtl?: number;
  mngrVdCnt?: number;
  itmDscTtl?: number;    // item discount total (comps)
  subDscTtl?: number;    // subtotal discount total
  taxCollTtl?: number;
  svcTtl?: number;       // service charge total
  chkOpnTtl?: number;
  chkClsdTtl?: number;
  numTbl?: number;
  tblTurnCnt?: number;
}

export interface SimphonyDailyTotals {
  locRef: string;
  busDt: string;
  revenueCenters: SimphonyRevenueCenterTotals[];
}

export interface SimphonyLocation {
  locRef: string;
  locName?: string;
  isActive?: boolean;
}

// Discount endpoints
export interface SimphonyDiscountEntry {
  dscNum: number;
  ttl: number;
  cnt: number;
}

export interface SimphonyDiscountDailyTotals {
  locRef: string;
  busDt: string;
  revenueCenters: Array<{
    rvcNum: number;
    discounts: SimphonyDiscountEntry[];
  }>;
}

export interface SimphonyDiscountDimension {
  num: number;
  name: string;
  mstrNum?: number;
  mstrName?: string;
  posPercent?: number;
  rptGrpName?: string;
}

// ══════════════════════════════════════════════════════════════════════════
// PKCE HELPERS
// ══════════════════════════════════════════════════════════════════════════

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );
}

// ══════════════════════════════════════════════════════════════════════════
// AUTH — Multiple grant flows for API accounts
// ══════════════════════════════════════════════════════════════════════════

/**
 * Bootstrap tokens for an API account.
 * Tries flows in order: client_credentials → PKCE (passwordless) → PKCE (with password).
 * API accounts typically don't need a password — the client_id is the credential.
 */
export async function bootstrapTokens(
  config: SimphonyBIConfig,
  username?: string,
  password?: string
): Promise<SimphonyTokenSet> {
  // 1. Try client_credentials grant (simplest — no password needed)
  try {
    return await bootstrapClientCredentials(config);
  } catch (err: any) {
    console.log(`[simphony-bi] Client credentials failed: ${err.message}`);
  }

  // 2. Try PKCE flow — authorize may return code directly for API accounts
  try {
    return await bootstrapPKCE(config, username, password);
  } catch (err: any) {
    throw new Error(`All Simphony auth flows failed. Last error: ${err.message}`);
  }
}

/**
 * Client credentials grant — just client_id, no user interaction.
 */
async function bootstrapClientCredentials(
  config: SimphonyBIConfig
): Promise<SimphonyTokenSet> {
  const tokenUrl = `${config.authServer}/oidc-provider/v1/oauth2/token`;

  const res = await fetchWithTimeout(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      scope: 'openid',
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`client_credentials: ${res.status} - ${text.slice(0, 300)}`);
  }

  const tokens = await res.json() as SimphonyTokenSet;
  if (!tokens.id_token && !tokens.access_token) {
    throw new Error('client_credentials returned no tokens');
  }
  return tokens;
}

/**
 * Full PKCE auth flow.
 * For API accounts, the authorize step may return the code directly (no signin needed).
 * Falls back to signin with username/password if provided.
 */
async function bootstrapPKCE(
  config: SimphonyBIConfig,
  username?: string,
  password?: string
): Promise<SimphonyTokenSet> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const redirectUri = 'apiaccount://callback';

  // Step 1: Authorize — initiate OIDC flow
  const authorizeUrl = `${config.authServer}/oidc-provider/v1/oauth2/authorize`;
  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authorizeRes = await fetchWithTimeout(
    `${authorizeUrl}?${authorizeParams.toString()}`,
    { method: 'GET', redirect: 'manual' }
  );

  // Check if authorize already returned the code (API account shortcut)
  const authorizeLocation = authorizeRes.headers.get('location') || '';
  let codeMatch = authorizeLocation.match(/[?&]code=([^&]+)/);

  if (!codeMatch) {
    // Need to signin — extract cookies from authorize for the signin step
    const cookies = extractCookies(authorizeRes);

    if (!username) {
      throw new Error(
        'Authorize did not return code directly and no username provided. ' +
        `Authorize status: ${authorizeRes.status}`
      );
    }

    const signinUrl = `${config.authServer}/oidc-provider/v1/oauth2/signin`;
    const signinBody: Record<string, string> = {
      username,
      password: password || '',
      orgname: config.orgIdentifier,
    };

    const signinRes = await fetchWithTimeout(signinUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: new URLSearchParams(signinBody).toString(),
    });

    // Signin returns JSON with redirectUrl containing the auth code
    const signinJson = await signinRes.json().catch(() => null) as any;
    if (!signinJson?.success || !signinJson?.redirectUrl) {
      throw new Error(
        `PKCE signin failed: ${signinJson?.message || signinJson?.error || JSON.stringify(signinJson)}`
      );
    }
    codeMatch = signinJson.redirectUrl.match(/[?&]code=([^&]+)/);
    if (!codeMatch) {
      throw new Error('No authorization code in signin redirectUrl');
    }
  }

  const authorizationCode = codeMatch[1];

  // Step 2: Token exchange — code + code_verifier → tokens
  const tokenUrl = `${config.authServer}/oidc-provider/v1/oauth2/token`;
  const tokenRes = await fetchWithTimeout(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: authorizationCode,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      scope: 'openid',
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(
      `PKCE token exchange failed: ${tokenRes.status} - ${text.slice(0, 300)}`
    );
  }

  const tokens = await tokenRes.json() as SimphonyTokenSet;
  if (!tokens.id_token) {
    throw new Error('PKCE token exchange returned no id_token');
  }

  return tokens;
}

/**
 * Refresh tokens using the refresh_token grant.
 * id_token valid 14 days, refresh_token valid 28 days.
 */
export async function refreshTokens(
  config: SimphonyBIConfig,
  refreshToken: string
): Promise<SimphonyTokenSet> {
  const tokenUrl = `${config.authServer}/oidc-provider/v1/oauth2/token`;

  const res = await fetchWithTimeout(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
      redirect_uri: 'apiaccount://callback',
      scope: 'openid',
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new SimphonyAuthExpiredError(
      `Simphony token refresh failed: ${res.status} - ${text.slice(0, 300)}`
    );
  }

  const tokens = await res.json() as SimphonyTokenSet;
  if (!tokens.id_token) {
    throw new SimphonyAuthExpiredError('Simphony token refresh returned no id_token');
  }

  return tokens;
}

// ══════════════════════════════════════════════════════════════════════════
// BI API — Data endpoints
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get pre-aggregated daily totals per revenue center.
 * This is the primary endpoint for sales pace polling.
 */
export async function getOperationsDailyTotals(
  config: SimphonyBIConfig,
  idToken: string,
  locRef: string,
  busDt: string
): Promise<SimphonyDailyTotals> {
  const url = `${config.appServer}/bi/v1/${config.orgIdentifier}/getOperationsDailyTotals`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ locRef, busDt }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Simphony getOperationsDailyTotals failed: ${res.status} - ${text.slice(0, 300)}`
    );
  }

  return await res.json() as SimphonyDailyTotals;
}

/**
 * Get all locations (for bootstrap — discover locRef values).
 */
export async function getLocationDimensions(
  config: SimphonyBIConfig,
  idToken: string
): Promise<SimphonyLocation[]> {
  const url = `${config.appServer}/bi/v1/${config.orgIdentifier}/getLocationDimensions`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Simphony getLocationDimensions failed: ${res.status} - ${text.slice(0, 300)}`
    );
  }

  return await res.json() as SimphonyLocation[];
}

/**
 * Get revenue center dimensions (for understanding food vs bar classification).
 */
export async function getRevenueCenterDimensions(
  config: SimphonyBIConfig,
  idToken: string,
  locRef: string
): Promise<any[]> {
  const url = `${config.appServer}/bi/v1/${config.orgIdentifier}/getRevenueCenterDimensions`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ locRef }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Simphony getRevenueCenterDimensions failed: ${res.status} - ${text.slice(0, 300)}`
    );
  }

  return await res.json() as any[];
}

/**
 * Get discount daily totals — per-discount-type breakdown by revenue center.
 * Returns dscNum (discount number) + ttl (total $) + cnt (times applied).
 * Join with getDiscountDimensions to get human-readable names.
 */
export async function getDiscountDailyTotals(
  config: SimphonyBIConfig,
  idToken: string,
  locRef: string,
  busDt: string
): Promise<SimphonyDiscountDailyTotals> {
  const url = `${config.appServer}/bi/v1/${config.orgIdentifier}/getDiscountDailyTotals`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ locRef, busDt }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Simphony getDiscountDailyTotals failed: ${res.status} - ${text.slice(0, 300)}`
    );
  }

  return await res.json() as SimphonyDiscountDailyTotals;
}

/**
 * Get discount dimensions — metadata for all configured discount types.
 * Returns num → name mapping (e.g. 15253 → "Manager Comp").
 */
export async function getDiscountDimensions(
  config: SimphonyBIConfig,
  idToken: string,
  locRef: string
): Promise<SimphonyDiscountDimension[]> {
  const url = `${config.appServer}/bi/v1/${config.orgIdentifier}/getDiscountDimensions`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ locRef }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Simphony getDiscountDimensions failed: ${res.status} - ${text.slice(0, 300)}`
    );
  }

  const data = await res.json() as any;
  // Response shape: { locRef, discounts: [...] }
  return (data.discounts || data) as SimphonyDiscountDimension[];
}

// ══════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ══════════════════════════════════════════════════════════════════════════

export class SimphonyAuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimphonyAuthExpiredError';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractCookies(res: Response): string {
  // Collect all Set-Cookie headers into a single Cookie string
  const setCookies = res.headers.getSetCookie?.() || [];
  if (setCookies.length > 0) {
    return setCookies.map((c) => c.split(';')[0]).join('; ');
  }
  // Fallback: try raw header
  const raw = res.headers.get('set-cookie');
  if (raw) {
    return raw
      .split(/,(?=\s*\w+=)/)
      .map((c) => c.trim().split(';')[0])
      .join('; ');
  }
  return '';
}
