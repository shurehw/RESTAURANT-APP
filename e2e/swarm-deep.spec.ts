/**
 * Deep swarm suite (@swarm-deep)
 *
 * Goes beyond route health checks by probing visible UI interactions:
 * - fills text inputs/textareas
 * - toggles checkboxes/radios/selects
 * - clicks safe buttons and links
 *
 * It records per-route actions and failures so regressions are actionable.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test.describe.configure({ mode: 'parallel' });

const APP_ROOT = path.join(process.cwd(), 'app');
const MAX_ROUTES = process.env.SWARM_DEEP_MAX_ROUTES
  ? Number(process.env.SWARM_DEEP_MAX_ROUTES)
  : null;
const ROUTE_TIMEOUT_MS = Number(process.env.SWARM_DEEP_ROUTE_TIMEOUT_MS || '15000');
const TEST_TIMEOUT_MS = Number(process.env.SWARM_DEEP_TEST_TIMEOUT_MS || '900000');
const ACTION_LIMIT = Number(process.env.SWARM_DEEP_ACTION_LIMIT || '20');

type ProbeReport = {
  route: string;
  finalUrl: string;
  status?: number;
  actions: string[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  error?: string;
};

function normalizeUrlPath(route: string): string {
  return route === '' ? '/' : `/${route}`;
}

function pathToRoute(relDir: string): string | null {
  const parts = relDir.split(path.sep).filter(Boolean);
  const routeParts: string[] = [];
  for (const segment of parts) {
    if (segment === 'api' || segment.startsWith('@')) return null;
    if (segment.startsWith('[')) return null;
    if (segment.startsWith('(')) continue;
    routeParts.push(segment);
  }
  return routeParts.join('/');
}

async function discoverRoutes(dir: string, acc: Set<string>) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'api') continue;
      await discoverRoutes(full, acc);
      continue;
    }
    if (!entry.isFile() || entry.name !== 'page.tsx') continue;
    const relDir = path.relative(APP_ROOT, path.dirname(full));
    const route = pathToRoute(relDir);
    if (route === null) continue;
    acc.add(normalizeUrlPath(route));
  }
}

async function getDeepSwarmRoutes(): Promise<string[]> {
  const routes = new Set<string>();
  await discoverRoutes(APP_ROOT, routes);
  return [...routes]
    .filter((r) => !r.startsWith('/present'))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_ROUTES ?? undefined);
}

function isDangerousLabel(text: string): boolean {
  return /\b(delete|remove|destroy|cancel order|void|archive|reset|revoke|disconnect|sign out|logout)\b/i.test(text);
}

async function isVisibleSafe(el: ReturnType<Page['locator']>): Promise<boolean> {
  try {
    return await el.isVisible();
  } catch {
    return false;
  }
}

async function probeInteractions(page: Page, actions: string[]) {
  let budget = ACTION_LIMIT;
  const take = () => budget-- > 0;

  const textInputs = page
    .locator('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="number"], textarea')
    .filter({ hasNot: page.locator('[readonly], [disabled]') });
  const inputCount = Math.min(await textInputs.count(), 8);
  for (let i = 0; i < inputCount && take(); i++) {
    const input = textInputs.nth(i);
    if (!(await isVisibleSafe(input))) continue;
    const type = (await input.getAttribute('type')) || 'text';
    const value =
      type === 'email'
        ? 'swarm@example.com'
        : type === 'tel'
          ? '3105551212'
          : type === 'number'
            ? '2'
            : 'swarm';
    try {
      await input.click({ timeout: 1200 });
      await input.fill(value, { timeout: 1500 });
      actions.push(`fill:${type}`);
    } catch {
      // best-effort probe
    }
  }

  const selects = page.locator('select:not([disabled])');
  const selectCount = Math.min(await selects.count(), 4);
  for (let i = 0; i < selectCount && take(); i++) {
    const select = selects.nth(i);
    if (!(await isVisibleSafe(select))) continue;
    try {
      const options = await select.locator('option').count();
      if (options > 1) {
        await select.selectOption({ index: 1 }, { timeout: 1500 });
        actions.push('select:index1');
      }
    } catch {
      // best-effort probe
    }
  }

  const toggles = page.locator('input[type="checkbox"]:not([disabled]), input[type="radio"]:not([disabled]), [role="switch"], [role="tab"]');
  const toggleCount = Math.min(await toggles.count(), 6);
  for (let i = 0; i < toggleCount && take(); i++) {
    const toggle = toggles.nth(i);
    if (!(await isVisibleSafe(toggle))) continue;
    try {
      await toggle.click({ timeout: 1200 });
      actions.push('toggle');
    } catch {
      // best-effort probe
    }
  }

  const buttons = page.locator('button:not([disabled]), [role="button"]');
  const buttonCount = Math.min(await buttons.count(), 10);
  for (let i = 0; i < buttonCount && take(); i++) {
    const btn = buttons.nth(i);
    if (!(await isVisibleSafe(btn))) continue;
    const label = ((await btn.innerText().catch(() => '')) || '').trim();
    if (label && isDangerousLabel(label)) continue;
    try {
      await btn.click({ timeout: 1200 });
      actions.push(`click:${label || 'button'}`);
      await page.waitForTimeout(120);
    } catch {
      // best-effort probe
    }
  }

  const links = page.locator('a[href]');
  const linkCount = Math.min(await links.count(), 4);
  for (let i = 0; i < linkCount && take(); i++) {
    const link = links.nth(i);
    if (!(await isVisibleSafe(link))) continue;
    const href = (await link.getAttribute('href')) || '';
    if (!href.startsWith('/') || href.startsWith('/api/')) continue;
    try {
      await link.click({ timeout: 1200 });
      actions.push(`link:${href}`);
      await page.waitForTimeout(120);
      await page.goBack({ waitUntil: 'commit', timeout: 4000 }).catch(() => {});
    } catch {
      // best-effort probe
    }
  }
}

test('@swarm-deep: discovered routes survive interaction probes', async ({ page }, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const context = page.context();
  const seedState = await context.storageState();
  const seedCookies = seedState.cookies;
  const routes = await getDeepSwarmRoutes();
  test.skip(routes.length === 0, 'No routes discovered');

  await testInfo.attach('deep-routes.json', {
    body: Buffer.from(JSON.stringify(routes, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  const reports: ProbeReport[] = [];

  for (const route of routes) {
    // Restore original auth/session cookies before each route so actions on one
    // page (e.g. profile/menu clicks) cannot invalidate later route probes.
    if (seedCookies.length > 0) {
      await context.clearCookies();
      await context.addCookies(seedCookies);
    }
    const routePage = await context.newPage();
    const actions: string[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    const onConsole = (msg: any) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    const onPageError = (err: Error) => pageErrors.push(err.message);
    const onRequestFailed = (req: any) => {
      const type = req.resourceType();
      if (type === 'document' || type === 'xhr' || type === 'fetch') {
        failedRequests.push(`[${type}] ${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'request failed'}`);
      }
    };

    routePage.on('console', onConsole);
    routePage.on('pageerror', onPageError);
    routePage.on('requestfailed', onRequestFailed);

    try {
      const response = await routePage.goto(route, { waitUntil: 'commit', timeout: ROUTE_TIMEOUT_MS });
      await routePage.waitForTimeout(120);
      await probeInteractions(routePage, actions);

      const finalUrl = routePage.url();
      const status = response?.status();
      const hasFatalText =
        (await routePage
          .getByText(/application error|runtime error|something went wrong/i)
          .first()
          .isVisible()
          .catch(() => false)) || false;

      const hasHardDocumentFailure = failedRequests.some((entry) => {
        const low = entry.toLowerCase();
        return low.startsWith('[document]') && !low.includes('err_aborted');
      });

      const isAuthRedirect = /\/login(?:\?|$)/.test(finalUrl) && route !== '/login';
      const hardFailure =
        !isAuthRedirect &&
        ((typeof status === 'number' && status >= 500) || hasFatalText || pageErrors.length > 0 || hasHardDocumentFailure);

      reports.push({
        route,
        finalUrl,
        status,
        actions,
        consoleErrors,
        pageErrors,
        failedRequests,
        error: hardFailure ? 'hard_failure' : isAuthRedirect ? 'auth_redirect' : undefined,
      });
    } catch (err: any) {
      const finalUrl = routePage.url();
      const isTimeout = String(err?.message || '').toLowerCase().includes('timeout');
      const authish = /\/login(?:\?|$)/.test(finalUrl) && route !== '/login' && isTimeout;
      const slowRoute = isTimeout && (finalUrl === 'about:blank' || (pageErrors.length === 0 && failedRequests.length === 0));
      reports.push({
        route,
        finalUrl,
        actions,
        consoleErrors,
        pageErrors,
        failedRequests,
        error: authish ? 'auth_redirect' : slowRoute ? 'slow_route' : (err?.message || 'navigation_error'),
      });
    } finally {
      routePage.off('console', onConsole);
      routePage.off('pageerror', onPageError);
      routePage.off('requestfailed', onRequestFailed);
      await routePage.close();
    }
  }

  await testInfo.attach('deep-swarm-report.json', {
    body: Buffer.from(JSON.stringify(reports, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  const artifactsDir = path.join(process.cwd(), '.artifacts', 'swarm-deep');
  await fs.mkdir(artifactsDir, { recursive: true });
  const roleName = testInfo.project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  await fs.writeFile(path.join(artifactsDir, `${roleName}.json`), JSON.stringify(reports, null, 2), 'utf8');

  const hardFailures = reports.filter((r) => r.error && r.error !== 'auth_redirect' && r.error !== 'slow_route');
  expect(
    hardFailures,
    `Deep swarm found hard failures on ${hardFailures.length} route(s). See deep-swarm-report.json.`
  ).toEqual([]);
});
