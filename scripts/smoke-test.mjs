/**
 * Playwright Smoke Test — navigates every sidebar page on production
 * Usage: npx playwright test scripts/smoke-test.mjs (or just node)
 *
 * DO NOT COMMIT — contains credentials
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://opsos-restaurant-app.vercel.app';
const EMAIL = 'jacob@hwoodgroup.com';
const PASSWORD = 'password123';

// Every sidebar route from layout.tsx + admin pages
const ROUTES = [
  { name: 'Home', path: '/' },
  // COGS
  { name: 'Orders', path: '/orders' },
  { name: 'Invoices', path: '/invoices' },
  { name: 'Reconciliation', path: '/reconciliation' },
  { name: 'Vendors', path: '/vendors' },
  { name: 'Products', path: '/products' },
  { name: 'Recipes', path: '/recipes' },
  { name: 'Inventory', path: '/inventory' },
  // Sales
  { name: 'Forecasts', path: '/sales/forecasts' },
  { name: 'Nightly Report', path: '/reports/nightly' },
  { name: 'Venue Health', path: '/reports/health' },
  { name: 'Preshift', path: '/preshift' },
  { name: 'Action Items', path: '/control-plane' },
  { name: 'Attestations', path: '/control-plane/attestations' },
  { name: 'Entertainment', path: '/entertainment' },
  // Labor
  { name: 'Daily Briefing', path: '/labor/briefing' },
  { name: 'Requirements', path: '/labor/requirements' },
  { name: 'Schedule', path: '/labor/schedule' },
  // Bottom section
  { name: 'AI Assistant', path: '/assistant' },
  { name: 'Budget', path: '/budget' },
  { name: 'Proforma', path: '/proforma' },
  { name: 'Savings', path: '/savings' },
  { name: 'Reports', path: '/reports' },
  // Admin
  { name: 'Comp Settings', path: '/admin/comp-settings' },
  { name: 'Procurement Settings', path: '/admin/procurement-settings' },
  // Settings pages
  { name: 'Org Settings', path: '/settings/organization' },
  // Sales Pace (if exists)
  { name: 'Sales Pace', path: '/sales/pace' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Collect console errors per page
  const results = [];

  // ── Login ──────────────────────────────────────────────
  console.log('=== LOGGING IN ===');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });

  await page.fill('input#email', EMAIL);
  await page.fill('input#password', PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log(`Logged in. Now at: ${page.url()}`);
  } catch {
    console.error('LOGIN FAILED — stuck on login page');
    await page.screenshot({ path: 'scripts/screenshots/login-failed.png' });
    await browser.close();
    process.exit(1);
  }

  // ── Navigate each route ────────────────────────────────
  for (const route of ROUTES) {
    const errors = [];
    const networkErrors = [];
    const consoleErrors = [];

    // Listen for console errors
    const onConsoleMsg = (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text().slice(0, 200));
      }
    };
    page.on('console', onConsoleMsg);

    // Listen for failed network requests
    const onRequestFailed = (req) => {
      networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || 'unknown'}`);
    };
    page.on('requestfailed', onRequestFailed);

    const url = `${BASE_URL}${route.path}`;
    console.log(`\n--- ${route.name} (${route.path}) ---`);

    let status = 'OK';
    let loadTime = 0;
    let pageTitle = '';
    let hasContent = false;
    let screenshotPath = '';

    try {
      const startTime = Date.now();
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      loadTime = Date.now() - startTime;

      const httpStatus = response?.status() || 0;

      // Check for redirects (e.g., auth redirect back to login)
      if (page.url().includes('/login')) {
        status = 'REDIRECT_TO_LOGIN';
      } else if (httpStatus >= 400) {
        status = `HTTP_${httpStatus}`;
      }

      // Wait a bit for client-side rendering
      await page.waitForTimeout(2000);

      // Check page content
      pageTitle = await page.title();
      const bodyText = await page.textContent('body');
      hasContent = (bodyText?.trim().length || 0) > 50;

      // Check for common error indicators in page content
      const errorIndicators = [
        'Application error',
        'Internal Server Error',
        '500',
        'Something went wrong',
        'No organizations found',
        'Failed to load',
        'Error:',
        'Unhandled Runtime Error',
      ];
      for (const indicator of errorIndicators) {
        if (bodyText?.includes(indicator)) {
          errors.push(`Page contains: "${indicator}"`);
        }
      }

      // Take screenshot
      const safeName = route.name.replace(/\s+/g, '-').toLowerCase();
      screenshotPath = `scripts/screenshots/${safeName}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });

    } catch (err) {
      status = 'TIMEOUT_OR_CRASH';
      errors.push(err.message?.slice(0, 200));
    }

    // Remove listeners
    page.off('console', onConsoleMsg);
    page.off('requestfailed', onRequestFailed);

    const result = {
      name: route.name,
      path: route.path,
      status,
      loadTime: `${loadTime}ms`,
      hasContent,
      consoleErrors: consoleErrors.length,
      networkErrors: networkErrors.length,
      pageErrors: errors,
      screenshot: screenshotPath,
    };

    results.push(result);

    // Print summary
    const icon = status === 'OK' && errors.length === 0 ? '✅' : status === 'REDIRECT_TO_LOGIN' ? '🔒' : '❌';
    console.log(`${icon} ${status} | ${loadTime}ms | Console errors: ${consoleErrors.length} | Page errors: ${errors.length}`);
    if (errors.length > 0) console.log(`   Errors: ${errors.join('; ')}`);
    if (consoleErrors.length > 0) console.log(`   Console: ${consoleErrors.slice(0, 3).join('; ')}`);
    if (networkErrors.length > 0) console.log(`   Network: ${networkErrors.slice(0, 3).join('; ')}`);
  }

  // ── Final Report ───────────────────────────────────────
  console.log('\n\n========== SMOKE TEST REPORT ==========\n');

  const ok = results.filter(r => r.status === 'OK' && r.pageErrors.length === 0);
  const warn = results.filter(r => r.status === 'OK' && r.pageErrors.length > 0);
  const fail = results.filter(r => r.status !== 'OK');

  console.log(`PASS: ${ok.length} | WARN: ${warn.length} | FAIL: ${fail.length} | TOTAL: ${results.length}\n`);

  if (warn.length > 0) {
    console.log('--- WARNINGS (loaded but has issues) ---');
    for (const r of warn) {
      console.log(`  ${r.name} (${r.path}): ${r.pageErrors.join('; ')}`);
    }
  }

  if (fail.length > 0) {
    console.log('\n--- FAILURES ---');
    for (const r of fail) {
      console.log(`  ${r.name} (${r.path}): ${r.status} — ${r.pageErrors.join('; ')}`);
    }
  }

  console.log('\n--- ALL RESULTS ---');
  for (const r of results) {
    const icon = r.status === 'OK' && r.pageErrors.length === 0 ? '✅' : r.status === 'REDIRECT_TO_LOGIN' ? '🔒' : '⚠️';
    console.log(`${icon} ${r.name.padEnd(25)} ${r.status.padEnd(20)} ${r.loadTime.padStart(7)} | errors: ${r.pageErrors.length} | console: ${r.consoleErrors}`);
  }

  await browser.close();
  console.log('\nDone. Screenshots in scripts/screenshots/');
}

run().catch(console.error);
