import { defineConfig, devices } from "@playwright/test";

const port = 4173;

// Runs against the real static export, with Firebase replaced by its local emulators.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: `http://127.0.0.1:${port}/PracticeMMI/`,
    reuseExistingServer: !process.env.CI,
  },
});
