import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const fakeMedia = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

// Runs against the real static export, with Firebase replaced by its local emulators.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", acceptDownloads: true },
  projects: [
    { name: "library", testMatch: /(smoke|questions|import)\.spec/, use: { ...devices["Desktop Chrome"] } },
    {
      // Full Chromium: the headless shell hangs on or crashes with fake devices.
      name: "simulator",
      testMatch: /practice\.spec/,
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
      use: { ...devices["Desktop Chrome"], channel: "chrome", launchOptions: { args: fakeMedia } },
    },
  ],
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: `http://127.0.0.1:${port}/PracticeMMI/`,
    reuseExistingServer: !process.env.CI,
  },
});
