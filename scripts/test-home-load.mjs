/**
 * Home Page Load Time Test
 *
 * Verifies the home page loads in <10s (redirects to /action-center).
 * Run: node scripts/test-home-load.mjs
 *
 * Requires PLAYWRIGHT_BASE_URL or defaults to http://localhost:3000
 * Requires TEST_EMAIL and TEST_PASSWORD for login
 */

import { chromium } from 'playwright';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const MAX_LOAD_MS = 10_000;

async function run() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_EMAIL and TEST_PASSWORD env vars');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(name, ok, detail = '') {
    if (ok) {
      console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
      passed++;
    } else {
      console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  try {
    // ── Login ──
    console.log('\n1. Logging in...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="email"], input[name="email"]', EMAIL);
    await page.fill('input[type="password"], input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
    console.log('   Logged in successfully');

    // ── Test 1: Home page loads in <10s ──
    console.log('\n2. Testing Home page load...');
    const t0 = Date.now();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: MAX_LOAD_MS });
    // Wait for redirect to settle
    await page.waitForLoadState('networkidle', { timeout: MAX_LOAD_MS });
    const loadTime = Date.now() - t0;
    assert('Home loads < 10s', loadTime < MAX_LOAD_MS, `${loadTime}ms`);

    // ── Test 2: Redirects to action-center (not nightly report) ──
    const url = page.url();
    const redirectsToActionCenter = url.includes('/action-center');
    const noNightlyRedirect = !url.includes('/reports/nightly');
    assert('Redirects to /action-center', redirectsToActionCenter, url);
    assert('No redirect to /reports/nightly', noNightlyRedirect, url);

    // ── Test 3: Page has content (not blank/error) ──
    const bodyText = await page.textContent('body');
    const hasContent = bodyText && bodyText.length > 100;
    assert('Page has content', hasContent, `${bodyText?.length || 0} chars`);

    // ── Test 4: Portfolio rollup API responds ──
    console.log('\n3. Testing rollup API...');
    const apiRes = await page.evaluate(async () => {
      const res = await fetch('/api/portfolio/rollup');
      return { status: res.status, ok: res.ok };
    });
    assert('Rollup API responds', apiRes.status === 200 || apiRes.status === 404, `status ${apiRes.status}`);

  } catch (err) {
    console.error('\nFATAL:', err.message);
    failed++;
  } finally {
    await browser.close();
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
