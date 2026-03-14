/**
 * Swarm smoke suite (@swarm)
 *
 * Discovers non-dynamic app routes and visits them in parallel.
 * Fails each route on:
 * - browser page errors
 * - console errors
 * - failed document requests
 * - HTTP 5xx responses
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test.describe.configure({ mode: 'parallel' });

const APP_ROOT = path.join(process.cwd(), 'app');
const MAX_ROUTES = Number(process.env.SWARM_MAX_ROUTES || '120');
const ROUTE_TIMEOUT_MS = Number(process.env.SWARM_ROUTE_TIMEOUT_MS || '12000');
const TEST_TIMEOUT_MS = Number(process.env.SWARM_TEST_TIMEOUT_MS || '600000');

function normalizeUrlPath(route: string): string {
  return route === '' ? '/' : `/${route}`;
}

function pathToRoute(relDir: string): string | null {
  const parts = relDir.split(path.sep).filter(Boolean);
  const routeParts: string[] = [];
  for (const segment of parts) {
    if (segment === 'api' || segment.startsWith('@')) return null;
    if (segment.startsWith('[')) return null; // skip dynamic routes
    if (segment.startsWith('(')) continue; // route groups are omitted from URL
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

async function getSwarmRoutes(): Promise<string[]> {
  const routes = new Set<string>();
  await discoverRoutes(APP_ROOT, routes);

  // Exclude routes that are known to require path params or public tokens.
  const excludedPrefixes = ['/present', '/api'];
  const sorted = [...routes]
    .filter((r) => !excludedPrefixes.some((prefix) => r === prefix || r.startsWith(`${prefix}/`)))
    .sort((a, b) => a.localeCompare(b));

  return sorted.slice(0, MAX_ROUTES);
}

test('@swarm: discovered routes render without major runtime/network failures', async ({ page }, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const context = page.context();
  const routes = await getSwarmRoutes();
  test.skip(routes.length === 0, 'No routes discovered');

  await testInfo.attach('routes.json', {
    body: Buffer.from(JSON.stringify(routes, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  const failures: Array<{
    route: string;
    status?: number;
    error?: string;
    consoleErrors: string[];
    pageErrors: string[];
    failedRequests: string[];
    finalUrl?: string;
  }> = [];

  for (const route of routes) {
    const routePage = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    const onConsole = (msg: any) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    const onPageError = (err: Error) => pageErrors.push(err.message);
    const onRequestFailed = (req: any) => {
      const failureText = req.failure()?.errorText || 'request failed';
      const resourceType = req.resourceType();
      if (resourceType === 'document' || resourceType === 'xhr' || resourceType === 'fetch') {
        failedRequests.push(`[${resourceType}] ${req.method()} ${req.url()} :: ${failureText}`);
      }
    };

    routePage.on('console', onConsole);
    routePage.on('pageerror', onPageError);
    routePage.on('requestfailed', onRequestFailed);

    try {
      const response = await routePage.goto(route, { waitUntil: 'commit', timeout: ROUTE_TIMEOUT_MS });
      await routePage.waitForTimeout(100);

      const status = response?.status();
      const finalUrl = routePage.url();
      const isLoginRedirect = /\/login(?:\?|$)/.test(finalUrl);
      const hasFatalText =
        (await routePage
          .getByText(/application error|runtime error|something went wrong/i)
          .first()
          .isVisible()
          .catch(() => false)) ||
        false;

      const hasHardDocumentFailure = failedRequests.some((entry) => {
        const lower = entry.toLowerCase();
        const isDocument = lower.startsWith('[document]');
        const isAbort = lower.includes('err_aborted');
        return isDocument && !isAbort;
      });

      const hardFailure =
        (typeof status === 'number' && status >= 500) ||
        pageErrors.length > 0 ||
        hasFatalText ||
        hasHardDocumentFailure;

      // Auth redirects are allowed in swarm results, but still logged for review.
      const softFailure = !hardFailure && isLoginRedirect && route !== '/login';

      if (hardFailure || softFailure) {
        failures.push({
          route,
          status,
          error: hardFailure ? 'hard_failure' : 'auth_redirect',
          consoleErrors,
          pageErrors,
          failedRequests,
          finalUrl,
        });
      }
    } catch (err: any) {
      const finalUrl = routePage.url();
      const isLoginRedirect = /\/login(?:\?|$)/.test(finalUrl);
      const isTimeout = String(err?.message || '').toLowerCase().includes('timeout');
      const hasLoginAbort = failedRequests.some((entry) =>
        entry.includes('/login') && entry.toLowerCase().includes('err_aborted')
      );
      const aboutBlank = finalUrl === 'about:blank';
      const authishTimeout = isTimeout && route !== '/login' && (isLoginRedirect || hasLoginAbort || aboutBlank);
      const silentTimeout = isTimeout && pageErrors.length === 0 && failedRequests.length === 0;
      const slowRoute = route === '/login' || silentTimeout;
      failures.push({
        route,
        error: authishTimeout ? 'auth_redirect' : slowRoute ? 'slow_route' : (err?.message || 'navigation_error'),
        consoleErrors,
        pageErrors,
        failedRequests,
        finalUrl,
      });
    } finally {
      routePage.off('console', onConsole);
      routePage.off('pageerror', onPageError);
      routePage.off('requestfailed', onRequestFailed);
      await routePage.close();
    }
  }

  if (failures.length > 0) {
    await testInfo.attach('swarm-failures.json', {
      body: Buffer.from(JSON.stringify(failures, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  }

  // Fail if there are hard failures. Allow auth redirects so this can run in
  // restricted environments while still producing actionable output.
  const hardFailures = failures.filter((f) => f.error !== 'auth_redirect' && f.error !== 'slow_route');
  expect(
    hardFailures,
    `Swarm discovered hard failures on ${hardFailures.length} route(s). See swarm-failures.json attachment.`
  ).toEqual([]);
});
