import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: ['**/safari.spec.ts', '**/lesson.spec.ts'], use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] } } },
    { name: 'webkit', testMatch: ['**/safari.spec.ts', '**/lesson.spec.ts', '**/firing.spec.ts', '**/hits.spec.ts', '**/map.spec.ts', '**/formation.spec.ts', '**/skip.spec.ts', '**/deployment.spec.ts'], use: { browserName: 'webkit', viewport: { width: 932, height: 430 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
