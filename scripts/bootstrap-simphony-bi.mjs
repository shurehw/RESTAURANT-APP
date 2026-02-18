/**
 * Simphony BI API Bootstrap Script
 *
 * One-time setup: authenticates with the Oracle Simphony BI API,
 * discovers location references, and stores tokens + mappings in Supabase.
 *
 * Usage (no password — API accounts use client credentials):
 *   node scripts/bootstrap-simphony-bi.mjs
 *
 * If a password IS required (falls back automatically):
 *   SIMPHONY_BI_PASSWORD=xxx node scripts/bootstrap-simphony-bi.mjs
 *
 * Optional env vars:
 *   SIMPHONY_BI_USERNAME   (default: OPS-OS)
 *   SIMPHONY_BI_LOC_REF    (skip discovery, set Dallas locRef directly)
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import 'dotenv/config';

// ── Config ──────────────────────────────────────────────────────────────

const CONFIG = {
  orgIdentifier: 'HWG',
  clientId: 'SIMPHONY_CLIENT_ID_REDACTED',
  authServer: 'https://ors-idm.us07.oraclerestaurants.com',
  appServer: 'https://simphony-home.us07.oraclerestaurants.com',
};

const USERNAME = process.env.SIMPHONY_BI_USERNAME || 'OPS-OS';
const PASSWORD = process.env.SIMPHONY_BI_PASSWORD || '';
const DALLAS_VENUE_ID = '79c33e6a-eb21-419f-9606-7494d1a9584c';
const MANUAL_LOC_REF = process.env.SIMPHONY_BI_LOC_REF;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── PKCE Helpers ────────────────────────────────────────────────────────

function base64URLEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
}

function extractCookies(res) {
  const setCookies = res.headers.getSetCookie?.() || [];
  if (setCookies.length > 0) {
    return setCookies.map(c => c.split(';')[0]).join('; ');
  }
  const raw = res.headers.get('set-cookie');
  if (raw) {
    return raw.split(/,(?=\s*\w+=)/).map(c => c.trim().split(';')[0]).join('; ');
  }
  return '';
}

// ── Auth Flow ───────────────────────────────────────────────────────────

async function authenticate() {
  // Try 1: Client credentials (API accounts typically don't need a password)
  console.log('\n1. Trying client_credentials grant (no password)...');
  try {
    const tokens = await tryClientCredentials();
    return tokens;
  } catch (err) {
    console.log('   Failed:', err.message);
  }

  // Try 2: PKCE flow (authorize may return code directly for API accounts)
  console.log('\n2. Trying PKCE flow...');
  return await tryPKCE();
}

async function tryClientCredentials() {
  const tokenUrl = `${CONFIG.authServer}/oidc-provider/v1/oauth2/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CONFIG.clientId,
      scope: 'openid',
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} - ${text.slice(0, 300)}`);
  }

  const tokens = await res.json();
  if (!tokens.id_token && !tokens.access_token) {
    throw new Error('No tokens returned');
  }
  console.log('   id_token:', tokens.id_token ? tokens.id_token.slice(0, 30) + '...' : 'MISSING');
  console.log('   access_token:', tokens.access_token ? tokens.access_token.slice(0, 30) + '...' : 'MISSING');
  console.log('   refresh_token:', tokens.refresh_token ? 'present' : 'none');
  console.log('   expires_in:', tokens.expires_in, 'seconds');
  return tokens;
}

async function tryPKCE() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const redirectUri = 'apiaccount://callback';

  console.log('   Generating PKCE verifier:', codeVerifier.slice(0, 20) + '...');

  console.log('   Authorize (GET)...');
  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: redirectUri,
    scope: 'openid',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authorizeRes = await fetch(
    `${CONFIG.authServer}/oidc-provider/v1/oauth2/authorize?${authorizeParams}`,
    { method: 'GET', redirect: 'manual' }
  );
  console.log('   Status:', authorizeRes.status);

  // Check if authorize returned code directly (API account shortcut)
  const authorizeLocation = authorizeRes.headers.get('location') || '';
  let codeMatch = authorizeLocation.match(/[?&]code=([^&]+)/);

  if (codeMatch) {
    console.log('   Code returned directly from authorize (no signin needed)');
  } else {
    // Need signin step
    const cookies = extractCookies(authorizeRes);
    console.log('   Cookies:', cookies ? cookies.slice(0, 50) + '...' : '(none)');

    console.log('   Signin (POST)...');
    const signinBody = { username: USERNAME, grant_type: 'password' };
    if (PASSWORD) signinBody.password = PASSWORD;

    const signinRes = await fetch(
      `${CONFIG.authServer}/oidc-provider/v1/oauth2/signin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(cookies ? { Cookie: cookies } : {}),
        },
        body: new URLSearchParams(signinBody).toString(),
        redirect: 'manual',
      }
    );
    console.log('   Status:', signinRes.status);

    const signinLocation = signinRes.headers.get('location') || '';
    codeMatch = signinLocation.match(/[?&]code=([^&]+)/);
    if (!codeMatch) {
      const body = await signinRes.text().catch(() => '');
      console.error('   Location header:', signinLocation || '(none)');
      console.error('   Response body:', body.slice(0, 500));
      throw new Error('Signin failed: no authorization code in redirect');
    }
  }

  const authorizationCode = codeMatch[1];
  console.log('   Authorization code:', authorizationCode.slice(0, 20) + '...');

  console.log('   Token exchange (POST)...');
  const tokenRes = await fetch(
    `${CONFIG.authServer}/oidc-provider/v1/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CONFIG.clientId,
        code: authorizationCode,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        scope: 'openid',
      }).toString(),
    }
  );

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed: ${tokenRes.status} - ${text}`);
  }

  const tokens = await tokenRes.json();
  console.log('   id_token:', tokens.id_token ? tokens.id_token.slice(0, 30) + '...' : 'MISSING');
  console.log('   refresh_token:', tokens.refresh_token ? 'present' : 'MISSING');
  console.log('   expires_in:', tokens.expires_in, 'seconds');

  return tokens;
}

// ── Location Discovery ──────────────────────────────────────────────────

async function discoverLocations(idToken) {
  console.log('\n5. Discovering locations (getLocationDimensions)...');
  const res = await fetch(
    `${CONFIG.appServer}/bi/v1/${CONFIG.orgIdentifier}/getLocationDimensions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('   Failed:', res.status, text.slice(0, 300));
    return null;
  }

  const locations = await res.json();
  console.log('   Found locations:');
  if (Array.isArray(locations)) {
    locations.forEach(loc => {
      console.log(`     locRef: ${loc.locRef || loc.num} | name: ${loc.locName || loc.name || 'N/A'}`);
    });
  } else {
    console.log('   Response:', JSON.stringify(locations, null, 2).slice(0, 500));
  }
  return locations;
}

// ── Revenue Center Discovery ────────────────────────────────────────────

async function discoverRevenueCenters(idToken, locRef) {
  console.log(`\n6. Discovering revenue centers for locRef=${locRef}...`);
  const res = await fetch(
    `${CONFIG.appServer}/bi/v1/${CONFIG.orgIdentifier}/getRevenueCenterDimensions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ locRef }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('   Failed:', res.status, text.slice(0, 300));
    return;
  }

  const rcs = await res.json();
  console.log('   Revenue centers:');
  if (Array.isArray(rcs)) {
    rcs.forEach(rc => {
      console.log(`     rvcNum: ${rc.rvcNum || rc.num} | name: ${rc.rvcName || rc.name || 'N/A'}`);
    });
  } else {
    console.log('   Response:', JSON.stringify(rcs, null, 2).slice(0, 500));
  }
}

// ── Store Results ───────────────────────────────────────────────────────

async function storeTokens(tokens) {
  console.log('\n7. Storing tokens in simphony_bi_tokens...');
  const now = new Date();
  const expiresIn = tokens.expires_in || 1209600;
  const tokenExpiresAt = new Date(now.getTime() + expiresIn * 1000);
  const refreshExpiresAt = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const { error } = await sb.from('simphony_bi_tokens').upsert({
    org_identifier: CONFIG.orgIdentifier,
    client_id: CONFIG.clientId,
    auth_server: CONFIG.authServer,
    app_server: CONFIG.appServer,
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokenExpiresAt.toISOString(),
    refresh_expires_at: refreshExpiresAt.toISOString(),
    last_refreshed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'org_identifier' });

  if (error) throw new Error(`Failed to store tokens: ${error.message}`);
  console.log('   Stored. Token expires:', tokenExpiresAt.toISOString());
}

async function storeLocationMapping(locRef) {
  console.log('\n8. Storing location mapping for Dallas...');
  const { error } = await sb.from('simphony_bi_location_mapping').upsert({
    venue_id: DALLAS_VENUE_ID,
    loc_ref: locRef,
    org_identifier: CONFIG.orgIdentifier,
    bar_revenue_centers: [2],
    is_active: true,
  }, { onConflict: 'venue_id' });

  if (error) throw new Error(`Failed to store mapping: ${error.message}`);
  console.log(`   Mapped Dallas (${DALLAS_VENUE_ID}) → locRef=${locRef}`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Simphony BI API Bootstrap                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Org: ${CONFIG.orgIdentifier} | User: ${USERNAME} | Password: ${PASSWORD ? 'set' : '(none)'}`);

  // Authenticate
  const tokens = await authenticate();

  // Store tokens
  await storeTokens(tokens);

  // Discover locations
  const locations = await discoverLocations(tokens.id_token);

  let locRef = MANUAL_LOC_REF;

  if (!locRef && locations) {
    // Try to find Dallas
    const flat = Array.isArray(locations) ? locations : [];
    const dallas = flat.find(l =>
      (l.locName || l.name || '').toLowerCase().includes('dallas') ||
      (l.locName || l.name || '').toLowerCase().includes('delilah')
    );
    if (dallas) {
      locRef = dallas.locRef || dallas.num || String(dallas.locRef);
      console.log(`\n   Auto-detected Dallas locRef: ${locRef}`);
    }
  }

  if (locRef) {
    // Discover revenue centers
    await discoverRevenueCenters(tokens.id_token, locRef);

    // Store mapping
    await storeLocationMapping(locRef);

    // Quick test: get today's totals
    console.log('\n9. Test: getOperationsDailyTotals for today...');
    const today = new Date().toISOString().split('T')[0];
    const testRes = await fetch(
      `${CONFIG.appServer}/bi/v1/${CONFIG.orgIdentifier}/getOperationsDailyTotals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.id_token}`,
        },
        body: JSON.stringify({ locRef, busDt: today }),
      }
    );
    if (testRes.ok) {
      const data = await testRes.json();
      console.log('   Result:', JSON.stringify(data, null, 2).slice(0, 500));
    } else {
      console.log('   Status:', testRes.status, await testRes.text().catch(() => ''));
    }
  } else {
    console.log('\nWARNING: Could not determine Dallas locRef.');
    console.log('Review the locations above and re-run with:');
    console.log('  SIMPHONY_BI_LOC_REF=<value> node scripts/bootstrap-simphony-bi.mjs');
  }

  console.log('\n✓ Bootstrap complete.');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
