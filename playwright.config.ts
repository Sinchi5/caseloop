import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4180', trace: 'retain-on-failure' },
  // Tests run against the production build, the same files that get deployed.
  webServer: {
    command: 'npm run build && npx vite preview --port 4180 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@phone/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
})
