import { test } from '@playwright/test';
import { runBrowserAgent } from './lib/browser-agent';

test('@browser-agent host-stand explores reachable browser states', async ({ page }, testInfo) => {
  test.setTimeout(900_000);

  await runBrowserAgent({
    context: page.context(),
    roleName: 'host-stand',
    routes: ['/host-stand'],
    testInfo,
  });
});
