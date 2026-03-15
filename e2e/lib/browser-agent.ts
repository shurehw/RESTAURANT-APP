import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type BrowserContext, type Page, type Response, type TestInfo } from '@playwright/test';

const APP_ROOT = path.join(process.cwd(), 'app');
const AGENT_ROUTE_TIMEOUT_MS = Number(process.env.BROWSER_AGENT_ROUTE_TIMEOUT_MS || '15000');
const AGENT_MAX_ROUTES = Number(process.env.BROWSER_AGENT_MAX_ROUTES || '10');
const AGENT_BRANCH_LIMIT = Number(process.env.BROWSER_AGENT_BRANCH_LIMIT || '6');
const AGENT_DEPTH_LIMIT = Number(process.env.BROWSER_AGENT_DEPTH_LIMIT || '1');
const AGENT_ACTIONS_PER_STATE = Number(process.env.BROWSER_AGENT_ACTIONS_PER_STATE || '4');
const AGENT_SETTLE_MS = Number(process.env.BROWSER_AGENT_SETTLE_MS || '250');

export type AgentActionKind = 'button' | 'link' | 'input' | 'checkbox' | 'radio' | 'select' | 'tab' | 'switch';

export type AgentAction = {
  id: string;
  key: string;
  kind: AgentActionKind;
  label: string;
  href?: string;
  type?: string;
};

export type AgentState = {
  url: string;
  title: string;
  heading: string;
  signature: string;
  actions: AgentAction[];
};

export type AgentBranchReport = {
  route: string;
  actionPath: string[];
  state: AgentState;
  error?: string;
};

export type AgentRouteReport = {
  route: string;
  exploredBranches: number;
  initialStatus?: number;
  states: AgentState[];
  branches: AgentBranchReport[];
  errors: string[];
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

export async function getAgentRoutes(options?: { include?: string[]; exclude?: RegExp[] }) {
  if (options?.include?.length) {
    return [...new Set(options.include)];
  }

  const routes = new Set<string>();
  await discoverRoutes(APP_ROOT, routes);
  return [...routes]
    .filter((route) => !route.startsWith('/present'))
    .filter((route) => !(options?.exclude || []).some((pattern) => pattern.test(route)))
    .sort((a, b) => a.localeCompare(b));
}

function isDangerousLabel(text: string) {
  return /\b(delete|remove|destroy|logout|sign out|disconnect|archive|revoke|clear all|drop database)\b/i.test(text);
}

async function gotoStable(page: Page, url: string, attempts = 3): Promise<Response | null> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: AGENT_ROUTE_TIMEOUT_MS });
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message || '');
      const retryable = message.includes('ERR_ABORTED') || message.toLowerCase().includes('timeout');
      if (!retryable || i === attempts - 1) break;
      await page.waitForTimeout(400 * (i + 1));
    }
  }
  throw lastError;
}

async function settlePage(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 1200 }).catch(() => {});
  await page.waitForTimeout(AGENT_SETTLE_MS);
}

async function snapshotState(page: Page): Promise<AgentState> {
  const readState = () => page.evaluate(({ actionLimit }) => {
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    for (const el of document.querySelectorAll('[data-agent-id]')) {
      el.removeAttribute('data-agent-id');
    }

    const selectors = [
      'a[href]',
      'button',
      '[role="button"]',
      '[role="tab"]',
      '[role="switch"]',
      'input',
      'textarea',
      'select',
    ];

    const actionables: AgentAction[] = [];
    const seen = new Set<string>();
    let index = 0;

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (!isVisible(node)) continue;
        if (node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true') continue;

        const role = node.getAttribute('role') || '';
        const tag = node.tagName.toLowerCase();
        const type = (node.getAttribute('type') || '').toLowerCase();
        const label = (
          node.getAttribute('aria-label') ||
          node.getAttribute('title') ||
          node.textContent ||
          node.getAttribute('placeholder') ||
          node.getAttribute('name') ||
          ''
        ).replace(/\s+/g, ' ').trim();
        const href = node.getAttribute('href') || undefined;

        let kind: AgentActionKind;
        if (tag === 'a') kind = 'link';
        else if (tag === 'select') kind = 'select';
        else if (tag === 'textarea') kind = 'input';
        else if (type === 'checkbox') kind = 'checkbox';
        else if (type === 'radio') kind = 'radio';
        else if (role === 'tab') kind = 'tab';
        else if (role === 'switch') kind = 'switch';
        else if (tag === 'input') kind = 'input';
        else kind = 'button';

        const key = [kind, label || tag, href || '', type || '', index].join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const id = `agent-${index}`;
        node.setAttribute('data-agent-id', id);
        actionables.push({ id, key, kind, label, href, type: type || undefined });
        index += 1;
        if (actionables.length >= actionLimit) break;
      }
      if (actionables.length >= actionLimit) break;
    }

    const heading =
      Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
    const title = (document.title || '').trim();
    const signature = JSON.stringify({
      path: `${location.pathname}${location.search}`,
      heading,
      title,
      actions: actionables.slice(0, 6).map((action) => action.key),
    });

    return {
      url: location.pathname + location.search,
      title,
      heading,
      signature,
      actions: actionables,
    };
  }, { actionLimit: AGENT_ACTIONS_PER_STATE });
  try {
    return await readState();
  } catch (error) {
    const message = String((error as Error)?.message || '');
    if (!message.toLowerCase().includes('execution context was destroyed')) {
      throw error;
    }
    await settlePage(page);
    return readState();
  }
}

async function performAction(page: Page, action: AgentAction) {
  const locator = page.locator(`[data-agent-id="${action.id}"]`).first();
  await expect(locator).toBeVisible({ timeout: 5000 });

  switch (action.kind) {
    case 'link':
    case 'button':
    case 'tab':
    case 'switch':
      await locator.click({ timeout: 3000 }).catch(async () => {
        await locator.click({ timeout: 3000, force: true });
      });
      break;
    case 'checkbox':
    case 'radio':
      await locator.click({ timeout: 3000, force: true });
      break;
    case 'select':
      await locator.selectOption({ index: 1 }, { timeout: 3000 });
      break;
    case 'input': {
      const inputType = (action.type || '').toLowerCase();
      const value =
        inputType === 'email'
          ? 'agent@example.com'
          : inputType === 'tel'
            ? '3105551212'
            : inputType === 'number'
              ? '2'
              : inputType === 'search'
                ? 'agent'
                : 'agent';
      await locator.click({ timeout: 3000 }).catch(() => {});
      await locator.fill(value, { timeout: 3000 }).catch(async () => {
        await locator.pressSequentially(value, { delay: 20 }).catch(() => {});
      });
      break;
    }
    default:
      break;
  }

  await settlePage(page);
}

async function runBranch(page: Page, route: string, actionPath: string[]) {
  const response = await gotoStable(page, route);
  await settlePage(page);

  const initialStatus = response?.status() ?? null;
  if (initialStatus != null && initialStatus >= 500) {
    throw new Error(`Initial route load returned ${initialStatus}`);
  }

  for (const expectedKey of actionPath) {
    const state = await snapshotState(page);
    const action = state.actions.find((candidate) => candidate.key === expectedKey);
    if (!action) {
      throw new Error(`Action no longer available: ${expectedKey}`);
    }
    if (action.label && isDangerousLabel(action.label)) {
      throw new Error(`Refused dangerous action: ${action.label}`);
    }
    if (action.kind === 'link' && action.href && (!action.href.startsWith('/') || action.href.startsWith('/api/'))) {
      throw new Error(`Refused external/api link: ${action.href}`);
    }
    await performAction(page, action);
  }

  const state = await snapshotState(page);
  if (/\b(500|application error|server error)\b/i.test(`${state.title} ${state.heading}`)) {
    throw new Error(`Route rendered an error shell: ${state.title || state.heading}`);
  }

  return { initialStatus, state };
}

function nextPaths(state: AgentState, path: string[], seenPaths: Set<string>) {
  const candidates: string[][] = [];
  for (const action of state.actions) {
    if (action.label && isDangerousLabel(action.label)) continue;
    if (action.kind === 'link' && action.href && (!action.href.startsWith('/') || action.href.startsWith('/api/'))) continue;
    const nextPath = [...path, action.key];
    const branchKey = JSON.stringify(nextPath);
    if (seenPaths.has(branchKey)) continue;
    candidates.push(nextPath);
    if (candidates.length >= AGENT_ACTIONS_PER_STATE) break;
  }
  return candidates;
}

export async function runBrowserAgent(options: {
  context: BrowserContext;
  roleName: string;
  routes: string[];
  testInfo: TestInfo;
}) {
  const { context, roleName, routes, testInfo } = options;
  const reports: AgentRouteReport[] = [];

  const artifactsDir = path.join(process.cwd(), '.artifacts', 'browser-agent');
  await fs.mkdir(artifactsDir, { recursive: true });

  for (const route of routes.slice(0, AGENT_MAX_ROUTES)) {
    const routeReport: AgentRouteReport = {
      route,
      exploredBranches: 0,
      states: [],
      branches: [],
      errors: [],
    };

    const stateSignatures = new Set<string>();
    const queuedPaths = new Set<string>(['[]']);
    const frontier: string[][] = [[]];

    while (frontier.length > 0 && routeReport.exploredBranches < AGENT_BRANCH_LIMIT) {
      const actionPath = frontier.shift()!;
      const page = await context.newPage();

      try {
        const { initialStatus, state } = await runBranch(page, route, actionPath);
        routeReport.exploredBranches += 1;
        if (routeReport.initialStatus == null && initialStatus != null) {
          routeReport.initialStatus = initialStatus;
        }
        routeReport.branches.push({ route, actionPath, state });

        if (!stateSignatures.has(state.signature)) {
          stateSignatures.add(state.signature);
          routeReport.states.push(state);
          if (actionPath.length < AGENT_DEPTH_LIMIT) {
            for (const nextPath of nextPaths(state, actionPath, queuedPaths)) {
              queuedPaths.add(JSON.stringify(nextPath));
              frontier.push(nextPath);
            }
          }
        }
      } catch (error) {
        routeReport.exploredBranches += 1;
        routeReport.errors.push(`${JSON.stringify(actionPath)} :: ${String((error as Error)?.message || error)}`);
        routeReport.branches.push({
          route,
          actionPath,
          state: {
            url: page.url() || route,
            title: '',
            heading: '',
            signature: `${route}:${JSON.stringify(actionPath)}:error`,
            actions: [],
          },
          error: String((error as Error)?.message || error),
        });
      } finally {
        await page.close().catch(() => {});
      }
    }

    reports.push(routeReport);
    await fs.writeFile(path.join(artifactsDir, `${roleName}.json`), JSON.stringify(reports, null, 2), 'utf8');
  }

  await testInfo.attach(`${roleName}-browser-agent-report.json`, {
    body: Buffer.from(JSON.stringify(reports, null, 2), 'utf8'),
    contentType: 'application/json',
  });

  await fs.writeFile(path.join(artifactsDir, `${roleName}.json`), JSON.stringify(reports, null, 2), 'utf8');

  return reports;
}
