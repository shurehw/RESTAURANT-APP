/**
 * Auth setup — runs before all test suites.
 * Authenticates via Supabase API and injects session into browser storage.
 * This bypasses the UI login form to work regardless of which login page
 * the dev server is serving.
 */
import { test as setup, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

setup.setTimeout(120_000);

dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback for vars not in .env.local

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const DASHBOARD_EMAIL = process.env.E2E_DASHBOARD_EMAIL!;
const DASHBOARD_PASSWORD = process.env.E2E_DASHBOARD_PASSWORD!;
const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL!;
const MANAGER_PASSWORD = process.env.E2E_MANAGER_PASSWORD!;
const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL!;
const VENDOR_PASSWORD = process.env.E2E_VENDOR_PASSWORD!;
const HOST_EMAIL = process.env.E2E_HOST_EMAIL!;
const HOST_PASSWORD = process.env.E2E_HOST_PASSWORD!;

async function supabaseLogin(email: string, password: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Supabase login failed for ${email}: ${error.message}`);
  return data.session!;
}

async function appLoginViaApi(page: any, email: string, password: string) {
  const res = await page.request.post('/api/auth/login', {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const payload = await res.json().catch(() => ({}));
  if (!payload?.success) {
    throw new Error(`API login returned non-success for ${email}`);
  }
}

async function gotoWithRetry(page: any, url: string, attempts = 3) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return true;
    } catch (err) {
      lastError = err;
      const msg = String((err as Error)?.message || '');
      const retryable = msg.includes('ERR_ABORTED') || msg.toLowerCase().includes('timeout');
      if (!retryable || i === attempts - 1) break;
      await page.waitForTimeout(500 * (i + 1));
    }
  }
  if (lastError) {
    console.warn(`[e2e auth] goto failed for ${url}: ${String((lastError as Error)?.message || lastError)}`);
  }
  return false;
}

async function uiLogin(page: any, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"]:visible').first();
  const passwordInput = page.locator('input[type="password"]:visible').first();
  await emailInput.click();
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill(password);
  await passwordInput.press('Tab').catch(() => {});

  const submit = page.locator('button:has-text("Sign In"):visible').first();
  const enabled = await submit.isEnabled().catch(() => false);
  if (enabled) {
    await submit.click();
  } else {
    // Fallback for forms that gate button enablement behind client state.
    await passwordInput.press('Enter');
  }

  await page.waitForURL((url: URL) => !/\/login(?:\?|$)/.test(url.pathname + url.search), {
    timeout: 15_000,
  });
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function writeAuthStateOrEmpty(params: {
  page: any;
  email?: string;
  password?: string;
  statePath: string;
  cookieDomain?: string;
}) {
  const { page, email, password, statePath, cookieDomain = 'localhost:4018' } = params;
  if (!email || !password) {
    // Create an empty state so dependent projects can still run in restricted envs.
    await page.context().storageState({ path: statePath });
    return;
  }

  try {
    await appLoginViaApi(page, email, password);
    await page.context().storageState({ path: statePath });
    return;
  } catch (apiErr) {
    console.warn(`[e2e auth] API login fallback to Supabase for ${email}: ${String((apiErr as Error)?.message || apiErr)}`);
  }

  const session = await supabaseLogin(email, password);

  // Navigate to the app so we can set localStorage on the correct origin
  const reachedApp = await gotoWithRetry(page, '/');
  if (!reachedApp) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
    return;
  }
  await page.waitForLoadState('domcontentloaded');

  // Inject Supabase session into localStorage (this is how @supabase/ssr stores it)
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await page.evaluate(
    ({ key, session }: { key: string; session: unknown }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, session }
  );

  // Also set the legacy user_id cookie if needed
  await page.context().addCookies([{
    name: 'user_id',
    value: session.user.id,
    url: `http://${cookieDomain}`,
    path: '/',
    httpOnly: true,
    secure: false,
  }]);

  // Verify auth state works with the app shell; if not, use real UI login.
  const reachedVerify = await gotoWithRetry(page, '/');
  if (reachedVerify) {
    const landedOnLogin = /\/login(?:\?|$)/.test(new URL(page.url()).pathname + new URL(page.url()).search);
    if (landedOnLogin) {
      try {
        await uiLogin(page, email, password);
      } catch (err) {
        // Keep setup resilient; downstream swarm will report auth_redirect coverage gaps.
        console.warn(`[e2e auth] UI login fallback failed for ${email}: ${(err as Error)?.message || err}`);
      }
    }
  }

  try {
    await page.context().storageState({ path: statePath });
  } catch {
    // If the page/context crashed, keep setup non-blocking with a valid empty state.
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
  }
}

setup('authenticate dashboard user', async ({ page }) => {
  await writeAuthStateOrEmpty({
    page,
    email: DASHBOARD_EMAIL,
    password: DASHBOARD_PASSWORD,
    statePath: 'e2e/.auth/dashboard.json',
  });
});

setup('authenticate manager user', async ({ page }) => {
  await writeAuthStateOrEmpty({
    page,
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
    statePath: 'e2e/.auth/manager.json',
  });
});

setup('authenticate vendor user', async ({ page }) => {
  await writeAuthStateOrEmpty({
    page,
    email: VENDOR_EMAIL,
    password: VENDOR_PASSWORD,
    statePath: 'e2e/.auth/vendor.json',
  });
});

setup('authenticate host stand user', async ({ page }) => {
  await writeAuthStateOrEmpty({
    page,
    email: HOST_EMAIL,
    password: HOST_PASSWORD,
    statePath: 'e2e/.auth/host-stand.json',
  });
});
