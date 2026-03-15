import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4018';
const E2E_SERVER_MODE = process.env.E2E_SERVER_MODE || 'dev';
const BASE_PORT = new URL(BASE_URL).port || '80';
const WEB_SERVER_COMMAND =
  E2E_SERVER_MODE === 'prod'
    ? `npm run start -- -p ${BASE_PORT}`
    : `npm run dev -- -p ${BASE_PORT} --webpack`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    // Auth setup — runs first to save session state
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    // Dashboard tests (desktop)
    {
      name: 'dashboard',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/dashboard.json',
      },
      dependencies: ['setup'],
      testMatch: /(dashboard.*|swarm(?:-deep)?)\.spec\.ts/,
    },
    {
      name: 'manager',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/manager.json',
      },
      dependencies: ['setup'],
      testMatch: /(manager.*|swarm(?:-deep)?)\.spec\.ts/,
    },
    {
      name: 'vendor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/vendor.json',
      },
      dependencies: ['setup'],
      testMatch: /(vendor.*|swarm(?:-deep)?)\.spec\.ts/,
    },

    // Host stand tests (iPad landscape)
    {
      name: 'host-stand',
      use: {
        viewport: { width: 1366, height: 1024 },
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
        storageState: 'e2e/.auth/host-stand.json',
        hasTouch: true,
      },
      dependencies: ['setup'],
      testMatch: /host-stand.*\.spec\.ts/,
    },
  ],

  // Start dev server automatically if not already running
  webServer: {
    command: WEB_SERVER_COMMAND,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
