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
// AUTH — OAuth2 + PKCE (3-step flow)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Full PKCE auth flow to get initial tokens.
 * Called once during bootstrap, or when refresh_token has expired.
 *
 * Flow: generate PKCE → authorize (get session) → signin (get code) → exchange (get tokens)
 */
export async function bootstrapTokens(
  config: SimphonyBIConfig,
  username: string,
  password: string
): Promise<SimphonyTokenSet> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const redirectUri = 'apiaccount://callback';

  // Step 1: Authorize — initiate OIDC flow, get session cookie
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

  // Extract session cookies for the signin step
  const cookies = extractCookies(authorizeRes);

  // Step 2: Signin — exchange API account credentials for authorization code
  const signinUrl = `${config.authServer}/oidc-provider/v1/oauth2/signin`;
  const signinRes = await fetchWithTimeout(signinUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: new URLSearchParams({
      username,
      password,
      grant_type: 'password',
    }).toString(),
    redirect: 'manual',
  });

  // The signin response redirects to the callback URI with the authorization code
  const location = signinRes.headers.get('location') || '';
  const codeMatch = location.match(/[?&]code=([^&]+)/);
  if (!codeMatch) {
    const body = await signinRes.text().catch(() => '');
    throw new Error(
      `Simphony signin failed: no authorization code in redirect. Status: ${signinRes.status}. Body: ${body.slice(0, 200)}`
    );
  }
  const authorizationCode = codeMatch[1];

  // Step 3: Token exchange — code + code_verifier → tokens
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
      `Simphony token exchange failed: ${tokenRes.status} - ${text.slice(0, 300)}`
    );
  }

  const tokens = await tokenRes.json() as SimphonyTokenSet;
  if (!tokens.id_token) {
    throw new Error('Simphony token exchange returned no id_token');
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
