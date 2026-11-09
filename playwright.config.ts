import { defineConfig, devices } from "@playwright/test";

const port = 8788;
const fakeMedia = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

// Tests run against the static export, served the way a static host serves it.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://127.0.0.1:${port}`, acceptDownloads: true },
  projects: [
    {
      name: "chromium",
      testIgnore: /long\.spec/,
      use: { ...devices["Desktop Chrome"], channel: "chromium", launchOptions: { args: fakeMedia } },
    },
    {
      // Real Google Chrome, in real time. Speech recognition is simulated by
      // default, because Chrome's real recogniser ignores the fake microphone
      // and listens to the computer's actual one. REAL_SPEECH=1 uses the real
      // thing: speak to the computer during the test.
      name: "chrome-long",
      testMatch: /long\.spec/,
      timeout: 15 * 60_000,
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        launchOptions: { args: fakeMedia },
      },
    },
  ],
  webServer: {
    command: `PORT=${port} node scripts/serve-static.mjs`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
