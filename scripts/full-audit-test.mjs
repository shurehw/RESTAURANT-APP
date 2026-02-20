/**
 * OpsOS Full Audit — Playwright Browser Agent
 *
 * Comprehensive functional test + artifact capture.
 * DO NOT COMMIT — contains credentials.
 *
 * Run: node scripts/full-audit-test.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://opsos-restaurant-app.vercel.app';
const EMAIL = 'jacob@hwoodgroup.com';
const PASSWORD = process.env.OPSOS_TEST_PASSWORD;
const SCREENSHOT_DIR = 'scripts/audit-screenshots';
const REPORT_PATH = 'scripts/audit-report.json';

// All routes from the sidebar + known pages
const ROUTES = [
  // Core
  { name: 'Home', path: '/', section: 'core' },
  // COGS
  { name: 'Orders', path: '/orders', section: 'cogs' },
  { name: 'Invoices', path: '/invoices', section: 'cogs' },
  { name: 'Reconciliation', path: '/reconciliation', section: 'cogs' },
  { name: 'Vendors', path: '/vendors', section: 'cogs' },
  { name: 'Products', path: '/products', section: 'cogs' },
  { name: 'Product Items', path: '/products/items', section: 'cogs' },
  { name: 'Recipes', path: '/recipes', section: 'cogs' },
  { name: 'Inventory', path: '/inventory', section: 'cogs' },
  // Sales
  { name: 'Forecasts', path: '/sales/forecasts', section: 'sales' },
  { name: 'Sales Pace', path: '/sales/pace', section: 'sales' },
  { name: 'Nightly Report', path: '/reports/nightly', section: 'sales' },
  { name: 'Venue Health', path: '/reports/health', section: 'sales' },
  { name: 'Preshift', path: '/preshift', section: 'sales' },
  { name: 'Action Items', path: '/control-plane', section: 'sales' },
  { name: 'Attestations', path: '/control-plane/attestations', section: 'sales' },
  { name: 'Entertainment', path: '/entertainment', section: 'sales' },
  // Labor
  { name: 'Daily Briefing', path: '/labor/briefing', section: 'labor' },
  { name: 'Requirements', path: '/labor/requirements', section: 'labor' },
  { name: 'Schedule', path: '/labor/schedule', section: 'labor' },
  // Tools
  { name: 'AI Assistant', path: '/assistant', section: 'tools' },
  { name: 'Budget', path: '/budget', section: 'tools' },
  { name: 'Proforma', path: '/proforma', section: 'tools' },
  { name: 'Savings', path: '/savings', section: 'tools' },
  { name: 'Reports', path: '/reports', section: 'tools' },
  // Admin
  { name: 'Org Settings', path: '/settings/organization', section: 'admin' },
  { name: 'Comp Settings', path: '/admin/comp-settings', section: 'admin' },
  { name: 'Procurement Settings', path: '/admin/procurement-settings', section: 'admin' },
  { name: 'Operational Standards', path: '/admin/operational-standards', section: 'admin' },
  { name: 'System Bounds', path: '/admin/system-bounds', section: 'admin' },
  { name: 'User Management', path: '/admin/users', section: 'admin' },
  // Settings
  { name: 'Proforma Settings', path: '/settings/proforma', section: 'admin' },
];

// Mobile viewports to test
const MOBILE_VIEWPORTS = [
  { name: 'iPhone-14', width: 390, height: 844 },
  { name: 'iPad', width: 820, height: 1180 },
];

// Error indicators to detect in page content
const ERROR_INDICATORS = [
  'Application error',
  'Internal Server Error',
  'Something went wrong',
  'No organizations found',
  'Failed to load',
  'Unhandled Runtime Error',
  'NEXT_NOT_FOUND',
  '404',
  'This page could not be found',
];

// Content quality indicators
const QUALITY_CHECKS = [
  { name: 'loading_spinner_stuck', pattern: /loading\.\.\.|Loading settings|Loading data/i },
  { name: 'placeholder_text', pattern: /lorem ipsum|TODO|FIXME|placeholder|coming soon/i },
  { name: 'empty_state', pattern: /no data|no results|nothing to show|no items/i },
  { name: 'debug_output', pattern: /console\.log|undefined|null|NaN|\[object Object\]/i },
];

async function run() {
  // Create screenshot directory
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const report = {
    metadata: {
      url: BASE_URL,
      timestamp: new Date().toISOString(),
      viewports: { desktop: '1440x900', mobile: MOBILE_VIEWPORTS },
    },
    login: { success: false, time_ms: 0 },
    pages: [],
    broken_links: [],
    console_errors: [],
    network_failures: [],
    form_issues: [],
    ui_anomalies: [],
    performance: [],
    mobile_issues: [],
    summary: {},
  };

  // ── Launch browser with tracing + video ──────────────────
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: SCREENSHOT_DIR, size: { width: 1440, height: 900 } },
  });

  // Start tracing
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });

  const page = await context.newPage();

  // Global network error collector
  const allNetworkErrors = [];
  page.on('requestfailed', (req) => {
    allNetworkErrors.push({
      url: req.url(),
      method: req.method(),
      error: req.failure()?.errorText || 'unknown',
    });
  });

  // ── LOGIN ────────────────────────────────────────────────
  console.log('=== LOGGING IN ===');
  const loginStart = Date.now();
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: join(SCREENSHOT_DIR, '00-login-page.png') });

    await page.fill('input#email', EMAIL);
    await page.fill('input#password', PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    report.login = { success: true, time_ms: Date.now() - loginStart, redirect_url: page.url() };
    console.log(`  Logged in (${report.login.time_ms}ms) → ${page.url()}`);
  } catch (e) {
    report.login = { success: false, time_ms: Date.now() - loginStart, error: e.message };
    console.error('  LOGIN FAILED:', e.message);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '00-login-failed.png') });
    await browser.close();
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // ── DESKTOP CRAWL: Every route ───────────────────────────
  console.log('\n=== DESKTOP CRAWL ===');

  for (let i = 0; i < ROUTES.length; i++) {
    const route = ROUTES[i];
    const pageResult = {
      name: route.name,
      path: route.path,
      section: route.section,
      status: 'OK',
      http_status: 0,
      load_time_ms: 0,
      has_content: false,
      content_length: 0,
      page_errors: [],
      console_errors: [],
      network_errors: [],
      quality_flags: [],
      screenshot: '',
      sidebar_visible: false,
      topbar_visible: false,
      h1_text: '',
    };

    // Collect console errors for this page
    const pageConsoleErrors = [];
    const onConsole = (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text().slice(0, 300);
        pageConsoleErrors.push(text);
        report.console_errors.push({ page: route.path, error: text });
      }
    };
    page.on('console', onConsole);

    // Collect network errors for this page
    const pageNetworkErrors = [];
    const onReqFailed = (req) => {
      const entry = {
        url: req.url().slice(0, 200),
        method: req.method(),
        error: req.failure()?.errorText || 'unknown',
      };
      pageNetworkErrors.push(entry);
      report.network_failures.push({ page: route.path, ...entry });
    };
    page.on('requestfailed', onReqFailed);

    const idx = String(i + 1).padStart(2, '0');
    const safeName = route.name.replace(/\s+/g, '-').toLowerCase();
    const url = `${BASE_URL}${route.path}`;

    console.log(`\n[${idx}/${ROUTES.length}] ${route.name} (${route.path})`);

    try {
      const start = Date.now();
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      pageResult.load_time_ms = Date.now() - start;
      pageResult.http_status = response?.status() || 0;

      // Check for auth redirect
      if (page.url().includes('/login')) {
        pageResult.status = 'REDIRECT_TO_LOGIN';
        pageResult.page_errors.push('Redirected to login — auth failure');
      } else if (pageResult.http_status >= 400) {
        pageResult.status = `HTTP_${pageResult.http_status}`;
      }

      // Wait for client-side rendering
      await page.waitForTimeout(2500);

      // Gather page data
      const bodyText = await page.textContent('body') || '';
      pageResult.content_length = bodyText.length;
      pageResult.has_content = bodyText.trim().length > 50;

      // H1 text
      try {
        pageResult.h1_text = await page.textContent('h1') || '';
      } catch { pageResult.h1_text = ''; }

      // Check sidebar visibility
      try {
        pageResult.sidebar_visible = await page.isVisible('aside');
      } catch { pageResult.sidebar_visible = false; }

      // Check topbar visibility
      try {
        pageResult.topbar_visible = await page.isVisible('header');
      } catch { pageResult.topbar_visible = false; }

      // Error indicator checks
      for (const indicator of ERROR_INDICATORS) {
        if (bodyText.includes(indicator)) {
          // Skip "500" false positives (matches dollar amounts, etc.)
          if (indicator === '500' && !bodyText.includes('Internal Server Error') && !bodyText.includes('Error 500')) continue;
          if (indicator === '404' && !bodyText.includes('not found') && !bodyText.includes('Not Found')) continue;
          pageResult.page_errors.push(`Contains: "${indicator}"`);
        }
      }

      // Quality checks
      for (const check of QUALITY_CHECKS) {
        if (check.pattern.test(bodyText)) {
          pageResult.quality_flags.push(check.name);
        }
      }

      // Screenshot
      pageResult.screenshot = `${idx}-${safeName}.png`;
      await page.screenshot({ path: join(SCREENSHOT_DIR, pageResult.screenshot), fullPage: false });

    } catch (err) {
      pageResult.status = 'TIMEOUT_OR_CRASH';
      pageResult.page_errors.push(err.message?.slice(0, 200));
    }

    pageResult.console_errors = pageConsoleErrors;
    pageResult.network_errors = pageNetworkErrors;

    // Remove listeners
    page.off('console', onConsole);
    page.off('requestfailed', onReqFailed);

    report.pages.push(pageResult);

    // Performance flag
    if (pageResult.load_time_ms > 10000) {
      report.performance.push({
        page: route.path,
        load_time_ms: pageResult.load_time_ms,
        flag: 'SLOW_LOAD',
      });
    }

    // Log
    const icon = pageResult.status === 'OK' && pageResult.page_errors.length === 0
      ? '✅' : pageResult.status === 'REDIRECT_TO_LOGIN' ? '🔒' : '⚠️';
    console.log(`  ${icon} ${pageResult.status} | ${pageResult.load_time_ms}ms | h1: "${pageResult.h1_text.slice(0, 40)}" | errors: ${pageResult.page_errors.length} | console: ${pageConsoleErrors.length}`);
    if (pageResult.page_errors.length > 0) console.log(`     Page errors: ${pageResult.page_errors.join('; ')}`);
    if (pageResult.quality_flags.length > 0) console.log(`     Quality flags: ${pageResult.quality_flags.join(', ')}`);
  }

  // ── LINK INTEGRITY CHECK ─────────────────────────────────
  console.log('\n=== LINK INTEGRITY CHECK ===');
  // Go to a page with lots of links (home or orders)
  await page.goto(`${BASE_URL}/orders`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  const allLinks = await page.$$eval('a[href]', (anchors) =>
    anchors.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0, 50) }))
  );
  console.log(`  Found ${allLinks.length} links on /orders page`);

  // Check sidebar links specifically
  const sidebarLinks = await page.$$eval('aside a[href]', (anchors) =>
    anchors.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim() }))
  );
  console.log(`  Sidebar links: ${sidebarLinks.length}`);
  for (const link of sidebarLinks) {
    console.log(`    ${link.href} → "${link.text}"`);
  }
  report.sidebar_links = sidebarLinks;

  // Check topbar buttons
  const topbarButtons = await page.$$eval('header button', (btns) =>
    btns.map(b => ({ label: b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 40) }))
  );
  console.log(`  Topbar buttons: ${topbarButtons.map(b => b.label).join(', ')}`);
  report.topbar_buttons = topbarButtons;

  // ── MOBILE VIEWPORT TEST ─────────────────────────────────
  console.log('\n=== MOBILE VIEWPORT TESTS ===');
  for (const vp of MOBILE_VIEWPORTS) {
    console.log(`\n  Testing ${vp.name} (${vp.width}x${vp.height})`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // Test a few key pages on mobile
    const mobilePages = ['/', '/orders', '/preshift', '/admin/comp-settings'];
    for (const mp of mobilePages) {
      try {
        await page.goto(`${BASE_URL}${mp}`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);

        // Check for horizontal overflow
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        // Check sidebar behavior on mobile
        const sidebarVisible = await page.isVisible('aside');

        const safeName = mp.replace(/\//g, '-').slice(1) || 'home';
        const ssPath = `mobile-${vp.name}-${safeName}.png`;
        await page.screenshot({ path: join(SCREENSHOT_DIR, ssPath) });

        const issues = [];
        if (hasOverflow) issues.push('horizontal-overflow');
        if (sidebarVisible) issues.push('sidebar-not-collapsed');

        if (issues.length > 0) {
          report.mobile_issues.push({
            viewport: vp.name,
            page: mp,
            issues,
            screenshot: ssPath,
          });
          console.log(`    ${mp}: ⚠️ ${issues.join(', ')}`);
        } else {
          console.log(`    ${mp}: ✅`);
        }
      } catch (e) {
        console.log(`    ${mp}: ❌ ${e.message.slice(0, 100)}`);
        report.mobile_issues.push({
          viewport: vp.name,
          page: mp,
          issues: ['load_failed'],
        });
      }
    }
  }

  // Reset to desktop
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── FORM VALIDATION TEST ─────────────────────────────────
  console.log('\n=== FORM VALIDATION TESTS ===');

  // Test login form with bad data
  const loginPage2 = await browser.newPage();
  try {
    await loginPage2.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });

    // Empty submit
    await loginPage2.click('button[type="submit"]');
    await loginPage2.waitForTimeout(1000);
    const emptyError = await loginPage2.textContent('body');
    const hasValidation = emptyError?.includes('required') || emptyError?.includes('invalid') || emptyError?.includes('error');
    report.form_issues.push({
      form: 'login',
      test: 'empty_submit',
      has_validation: hasValidation,
      screenshot: 'form-login-empty.png',
    });
    await loginPage2.screenshot({ path: join(SCREENSHOT_DIR, 'form-login-empty.png') });
    console.log(`  Login empty submit: ${hasValidation ? '✅ Validated' : '⚠️ No validation message'}`);

    // Bad email
    await loginPage2.fill('input#email', 'notanemail');
    await loginPage2.fill('input#password', 'x');
    await loginPage2.click('button[type="submit"]');
    await loginPage2.waitForTimeout(2000);
    const badEmailText = await loginPage2.textContent('body');
    const hasBadEmailError = badEmailText?.includes('invalid') || badEmailText?.includes('error') || badEmailText?.includes('Invalid');
    report.form_issues.push({
      form: 'login',
      test: 'bad_email',
      has_validation: hasBadEmailError,
      screenshot: 'form-login-bad-email.png',
    });
    await loginPage2.screenshot({ path: join(SCREENSHOT_DIR, 'form-login-bad-email.png') });
    console.log(`  Login bad email: ${hasBadEmailError ? '✅ Error shown' : '⚠️ No error for bad email'}`);

  } catch (e) {
    console.log(`  Form test error: ${e.message.slice(0, 100)}`);
  }
  await loginPage2.close();

  // ── GENERATE SUMMARY ─────────────────────────────────────
  const okPages = report.pages.filter(p => p.status === 'OK' && p.page_errors.length === 0);
  const warnPages = report.pages.filter(p => p.status === 'OK' && p.page_errors.length > 0);
  const failPages = report.pages.filter(p => p.status !== 'OK');
  const slowPages = report.pages.filter(p => p.load_time_ms > 10000);

  report.summary = {
    total_pages: report.pages.length,
    pass: okPages.length,
    warn: warnPages.length,
    fail: failPages.length,
    slow_pages: slowPages.length,
    total_console_errors: report.console_errors.length,
    total_network_failures: report.network_failures.length,
    total_mobile_issues: report.mobile_issues.length,
    total_form_issues: report.form_issues.length,
    avg_load_time_ms: Math.round(report.pages.reduce((s, p) => s + p.load_time_ms, 0) / report.pages.length),
    sidebar_links_count: sidebarLinks.length,
    topbar_buttons_count: topbarButtons.length,
  };

  // ── SAVE REPORT + TRACE ──────────────────────────────────
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to ${REPORT_PATH}`);

  // Save trace
  await context.tracing.stop({ path: join(SCREENSHOT_DIR, 'trace.zip') });
  console.log('Trace saved to trace.zip');

  await browser.close();

  // ── PRINT FINAL SUMMARY ──────────────────────────────────
  console.log('\n\n========================================');
  console.log('         FULL AUDIT REPORT');
  console.log('========================================\n');
  console.log(`PASS: ${okPages.length} | WARN: ${warnPages.length} | FAIL: ${failPages.length} | TOTAL: ${report.pages.length}`);
  console.log(`Avg load time: ${report.summary.avg_load_time_ms}ms`);
  console.log(`Console errors: ${report.console_errors.length}`);
  console.log(`Network failures: ${report.network_failures.length}`);
  console.log(`Mobile issues: ${report.mobile_issues.length}`);
  console.log(`Sidebar links: ${sidebarLinks.length}`);
  console.log(`Topbar buttons: ${topbarButtons.length}`);

  if (warnPages.length > 0) {
    console.log('\n--- WARNINGS ---');
    for (const p of warnPages) {
      console.log(`  ${p.name} (${p.path}): ${p.page_errors.join('; ')}`);
    }
  }

  if (failPages.length > 0) {
    console.log('\n--- FAILURES ---');
    for (const p of failPages) {
      console.log(`  ${p.name} (${p.path}): ${p.status} — ${p.page_errors.join('; ')}`);
    }
  }

  if (slowPages.length > 0) {
    console.log('\n--- SLOW PAGES (>10s) ---');
    for (const p of slowPages) {
      console.log(`  ${p.name} (${p.path}): ${p.load_time_ms}ms`);
    }
  }

  console.log('\n--- ALL PAGES ---');
  for (const p of report.pages) {
    const icon = p.status === 'OK' && p.page_errors.length === 0 ? '✅'
      : p.status === 'REDIRECT_TO_LOGIN' ? '🔒' : '⚠️';
    const flags = p.quality_flags.length > 0 ? ` [${p.quality_flags.join(',')}]` : '';
    console.log(`  ${icon} ${p.name.padEnd(25)} ${p.status.padEnd(20)} ${String(p.load_time_ms).padStart(6)}ms | h1: "${p.h1_text.slice(0,30)}"${flags}`);
  }

  console.log('\nDone. Screenshots in', SCREENSHOT_DIR);
}

run().catch(console.error);
