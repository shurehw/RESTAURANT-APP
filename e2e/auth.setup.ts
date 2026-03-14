/**
 * Auth setup — runs before all test suites.
 * Authenticates via Supabase API and injects session into browser storage.
 * This bypasses the UI login form to work regardless of which login page
 * the dev server is serving.
 */
import { test as setup } from '@playwright/test';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

async function writeAuthStateOrEmpty(params: {
  page: any;
  email?: string;
  password?: string;
  statePath: string;
  cookieDomain?: string;
}) {
  const { page, email, password, statePath, cookieDomain = 'localhost' } = params;
  if (!email || !password) {
    // Create an empty state so dependent projects can still run in restricted envs.
    await page.context().storageState({ path: statePath });
    return;
  }

  const session = await supabaseLogin(email, password);

  // Navigate to the app so we can set localStorage on the correct origin
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Inject Supabase session into localStorage (this is how @supabase/ssr stores it)
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, session }
  );

  // Also set the legacy user_id cookie if needed
  await page.context().addCookies([
    {
      name: 'user_id',
      value: session.user.id,
      domain: cookieDomain,
      path: '/',
      httpOnly: true,
      secure: false,
    },
  ]);

  await page.context().storageState({ path: statePath });
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
