// Real-time tests in real Google Chrome. Together these take about ten minutes.
// See playwright.config.ts for what REAL_SPEECH=1 does.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { addOneOff, continueAndCheckDevices, fakeSpeech, playerFacts, setTime, signInAndOpen, waitForReview } from "./helpers";

const realSpeech = process.env.REAL_SPEECH === "1";

/** Behaves as Chrome does: it keeps ending by itself, often after a no-speech error. */
async function chromeLikeSpeech(page: Page) {
  await page.addInitScript(() => {
    let spoken = 0;
    class Simulated {
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      timers: number[] = [];
      results: unknown[] = [];
      start() {
        Object.assign(window, { speechStarts: ((window as unknown as { speechStarts?: number }).speechStarts ?? 0) + 1 });
        const speak = window.setInterval(() => {
          spoken += 1;
          const result = Object.assign([{ transcript: `the physician sentence number ${spoken} ` }], { isFinal: true });
          this.results.push(result);
          this.onresult?.({ resultIndex: this.results.length - 1, results: Object.assign([...this.results], { length: this.results.length }) });
        }, 4000);
        const end = window.setTimeout(() => {
          clearInterval(speak);
          this.onerror?.({ error: "no-speech" });
          this.onend?.();
        }, 45_000);
        this.timers = [speak, end];
      }
      stop() {
        this.timers.forEach((timer) => clearTimeout(timer));
        setTimeout(() => this.onend?.(), 100);
      }
      abort() {
        this.stop();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: Simulated, SpeechRecognition: undefined });
  });
}

function parseCountdown(text: string): number {
  const [minutes, seconds] = text.split(":").map(Number);
  return minutes! * 60 + seconds!;
}

test("a full six-minute response records and transcribes", async ({ page }) => {
  const seenErrors: string[] = [];
  page.on("pageerror", (error) => seenErrors.push(error.message));
  if (!realSpeech) await chromeLikeSpeech(page);

  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 2);
  await addOneOff(page, "Why do you want to be a physician?");
  await continueAndCheckDevices(page);
  await expect(page.getByLabel("Transcribe what I say")).toBeChecked();
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByTestId("phase-label")).toHaveText("Speak", { timeout: 6000 });
  const speakingStarted = Date.now();
  await expect(page.locator(".rec")).toBeVisible();

  // The countdown must match the wall clock through the whole answer.
  const drift: number[] = [];
  while (Date.now() - speakingStarted < 330_000) {
    await page.waitForTimeout(30_000);
    const shown = parseCountdown((await page.getByTestId("countdown").textContent())!);
    drift.push(Math.abs(shown - (360 - (Date.now() - speakingStarted) / 1000)));
  }
  console.log("countdown drift (s):", drift.map((value) => value.toFixed(2)).join(", "));
  expect(drift.length).toBeGreaterThanOrEqual(10);
  expect(drift.length).toBeLessThanOrEqual(12);
  expect(Math.max(...drift)).toBeLessThan(2);

  await waitForReview(page, 60_000);
  const total = (Date.now() - speakingStarted) / 1000;
  console.log("speaking phase to review page (s):", total.toFixed(1));
  expect(total).toBeLessThan(370);

  const facts = await playerFacts(page);
  console.log("player:", JSON.stringify(facts), await page.locator("video.player").evaluate((el: HTMLVideoElement) => el.src.slice(0, 10)));
  expect(facts.duration).toBeGreaterThan(357);
  expect(facts.duration).toBeLessThan(363);

  // Seek near the end and confirm that the end of the answer is really there.
  const video = page.locator("video.player");
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    el.currentTime = el.duration - 5;
    await new Promise((resolve) => el.addEventListener("seeked", resolve, { once: true }));
    await el.play();
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(facts.duration - 4.5);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download recording" }).click()]);
  const path = await download.path();
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size,format_name:stream=codec_type,codec_name,width,height", "-of", "json", path], { encoding: "utf8" })) as {
    format: { duration?: string; size: string; format_name: string };
    streams: Array<{ codec_type: string; codec_name: string }>;
  };
  console.log("file:", download.suggestedFilename(), JSON.stringify(probe));
  const decoded = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-map", "0:v:0", "-c", "copy", "-"], { encoding: "utf8" });
  expect(decoded).toBe("");
  expect(probe.streams.map((stream) => stream.codec_type).sort()).toEqual(["audio", "video"]);

  const transcript = await page.getByLabel("Transcript").inputValue();
  console.log(`transcript: ${transcript.length} characters. Start: ${transcript.slice(0, 200)}`);
  expect(transcript.length).toBeGreaterThan(0);
  if (!realSpeech) {
    // Nothing lost or repeated across the restarts.
    const numbers = [...transcript.matchAll(/number (\d+)/g)].map((match) => Number(match[1]));
    console.log(`phrases: ${numbers.length}`);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(75);
  }
  expect(seenErrors).toEqual([]);
});

test("a full mock runs eight stations with the two-minute break after station four", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await page.getByRole("radio", { name: /Full mock/ }).check();
  await setTime(page, "Preparation time", 0, 1);
  await setTime(page, "Speaking time", 0, 10);
  for (let station = 1; station <= 8; station += 1) await addOneOff(page, `Mock question ${station}`);
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByTestId("station-progress")).toHaveText("Station 4 of 8", { timeout: 40_000 });
  await expect(page.getByTestId("phase-label")).toHaveText("Break", { timeout: 15_000 });
  const breakStarted = Date.now();
  await expect(page.getByTestId("station-progress")).toHaveText("Next: station 5 of 8");
  await expect(page.locator(".rec")).toBeHidden();
  await expect(page.getByTestId("question")).toBeHidden();
  const samples: string[] = [];
  for (let sample = 0; sample < 11; sample += 1) {
    await page.waitForTimeout(10_000);
    const shown = parseCountdown((await page.getByTestId("countdown").textContent())!);
    const expected = 120 - (Date.now() - breakStarted) / 1000;
    samples.push(`${shown}/${expected.toFixed(1)}`);
    expect(Math.abs(shown - expected), `break countdown at sample ${sample}: ${samples.join(" ")}`).toBeLessThan(3);
  }
  console.log("break countdown shown/expected:", samples.join(" "));
  await expect(page.getByTestId("phase-label")).toHaveText("Prepare", { timeout: 30_000 });
  const breakSeconds = (Date.now() - breakStarted) / 1000;
  console.log("break lasted (s):", breakSeconds.toFixed(1));
  expect(breakSeconds).toBeGreaterThan(118);
  expect(breakSeconds).toBeLessThan(122);
  await expect(page.getByTestId("question")).toHaveText("Mock question 5");

  await waitForReview(page, 60_000);
  for (let station = 1; station <= 8; station += 1) {
    await page.getByRole("button", { name: `Station ${station}`, exact: true }).click();
    await expect(page.getByText(`Mock question ${station}`)).toBeVisible();
    const facts = await playerFacts(page, new RegExp(`station ${station}$`));
    expect(facts.duration).toBeGreaterThan(8.5);
  }
});
