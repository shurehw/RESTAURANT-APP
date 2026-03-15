import { test } from '@playwright/test';
import { getAgentRoutes, runBrowserAgent } from './lib/browser-agent';

test('@browser-agent vendor explores reachable browser states', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const routes = await getAgentRoutes({
    exclude: [/^\/host-stand/, /^\/share(?:\/|$)/, /^\/vendor-onboarding(?:\/|$)/],
  });

  await runBrowserAgent({
    context: page.context(),
    roleName: 'vendor',
    routes,
    testInfo,
  });
});
