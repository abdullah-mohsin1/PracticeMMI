import { expect, type Page } from "@playwright/test";

export async function fakeSpeech(page: Page, words = "this is my spoken answer") {
  await page.addInitScript((text) => {
    class Fake {
      onresult: ((event: unknown) => void) | null = null;
      onerror: unknown = null;
      onend: (() => void) | null = null;
      timer = 0;
      start() {
        this.timer = window.setTimeout(() => {
          const result = Object.assign([{ transcript: text }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
        }, 300);
      }
      stop() {
        clearTimeout(this.timer);
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this.stop();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: Fake, SpeechRecognition: undefined });
  }, words);
}

/** Each recognition start says something different, to expose text leaking between stations. */
export async function numberedFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    let starts = 0;
    class Fake {
      onresult: ((event: unknown) => void) | null = null;
      onerror: unknown = null;
      onend: (() => void) | null = null;
      start() {
        starts += 1;
        const text = `words from recognition ${starts}`;
        setTimeout(() => {
          const result = Object.assign([{ transcript: text }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
        }, 300);
      }
      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this.stop();
      }
    }
    Object.assign(window, { webkitSpeechRecognition: Fake, SpeechRecognition: undefined });
  });
}

export async function noSpeech(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
  });
}

/** Keeps a handle on the camera stream, so a test can pull the plug on it. */
export async function exposeStream(page: Page) {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      Object.assign(window, { lastStream: stream });
      return stream;
    };
  });
}

export async function setTime(page: Page, label: string, minutes: number, seconds: number) {
  await page.getByLabel(`${label} minutes`).fill(String(minutes));
  await page.getByLabel(`${label} seconds`).fill(String(seconds));
}

export async function addOneOff(page: Page, text: string) {
  await page.getByLabel("One-off question").fill(text);
  await page.getByRole("button", { name: "Add to this session" }).click();
}

export async function continueAndCheckDevices(page: Page) {
  await page.getByRole("button", { name: "Continue to device check" }).click();
  await page.getByRole("button", { name: "Turn on camera and microphone" }).click();
  await expect(page.getByText("Camera: working")).toBeVisible();
  await expect(page.getByText(/Microphone: working/)).toBeVisible();
}

export async function waitForReview(page: Page, timeout = 60_000) {
  await expect(page.getByRole("heading", { name: "Review your practice" })).toBeVisible({ timeout });
}

export interface PlayerFacts {
  duration: number;
  width: number;
  height: number;
}

/** Waits until the player knows the real length, then reports it. */
export async function playerFacts(page: Page, name: RegExp = /Recording of station/): Promise<PlayerFacts> {
  const video = page.locator("video.player").first();
  await expect(video).toHaveAttribute("aria-label", name);
  // Finished means the length is known and the player is back at the start.
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => Number.isFinite(el.duration) && el.duration > 0 && !el.seeking && el.currentTime === 0), { timeout: 30_000 })
    .toBe(true);
  return video.evaluate((el: HTMLVideoElement) => ({ duration: el.duration, width: el.videoWidth, height: el.videoHeight }));
}
