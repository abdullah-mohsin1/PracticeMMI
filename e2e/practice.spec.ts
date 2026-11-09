import { readFile, stat } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { buildQuestionBank } from "./helpers/pdf";
import { addOneOff, continueAndCheckDevices, exposeStream, fakeSpeech, noSpeech, numberedFakeSpeech, playerFacts, setTime, signInAndOpen, waitForReview } from "./helpers";

test.describe.configure({ timeout: 120_000 });

test("question bank: add, edit, delete, and it survives a reload", async ({ page }) => {
  await signInAndOpen(page, "/");
  await expect(page.getByText("Your question bank is empty")).toBeVisible();

  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Why medicine?");
  await page.getByLabel("Category").selectOption("personal");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("list", { name: "Question bank" }).getByText("Why medicine?")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Why medicine?")).toBeVisible();

  await page.getByRole("button", { name: "Edit: Why medicine?" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Why this school?");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText("Why this school?")).toBeVisible();

  await page.getByRole("button", { name: "Delete: Why this school?" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Your question bank is empty")).toBeVisible();
});

test("practice from start to finish: timer, recording, playback, downloads and transcript", async ({ page }) => {
  // Firebase may carry question-library calls. Nothing else may leave, and
  // nothing the size of a recording may leave at all.
  const outbound: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("blob:") || url.startsWith("data:") || request.method() === "GET" || request.method() === "HEAD") return;
    const isFirebase = /^http:\/\/127\.0\.0\.1:(8080|9099)\//.test(url);
    if (!isFirebase || (request.postDataBuffer()?.length ?? 0) > 20_000) outbound.push(`${request.method()} ${url}`);
  });
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 3);
  await setTime(page, "Speaking time", 0, 12);
  await addOneOff(page, "Describe a time you changed your mind.");
  await continueAndCheckDevices(page);
  await expect(page.getByLabel("Your camera preview")).toBeVisible();
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByTestId("phase-label")).toHaveText("Prepare");
  await expect(page.getByRole("link", { name: "PracticeMMI" })).toBeHidden();
  await expect(page.getByTestId("question")).toHaveText("Describe a time you changed your mind.");
  await expect(page.locator(".rec")).toBeHidden();

  await expect(page.getByTestId("phase-label")).toHaveText("Speak", { timeout: 6000 });
  await expect(page.locator(".rec")).toBeVisible();
  await expect(page.getByLabel("Your camera preview")).toBeVisible();
  await expect(page.getByTestId("live-transcript")).toContainText("this is my spoken answer");
  expect(await page.getByTestId("countdown").textContent()).toMatch(/^0:(0[89]|1[0-2])$/);

  await waitForReview(page);
  const facts = await playerFacts(page);
  expect(facts.duration).toBeGreaterThan(10.5);
  expect(facts.duration).toBeLessThan(13.5);
  expect(facts.width).toBeGreaterThan(0);

  // It actually plays.
  const video = page.locator("video.player");
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    await el.play();
  });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.5);

  const [recording] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download recording" }).click()]);
  expect(recording.suggestedFilename()).toMatch(/^PracticeMMI-\d{4}-\d{2}-\d{2}-station-1\.(webm|mp4)$/);
  expect((await stat(await recording.path())).size).toBeGreaterThan(50_000);

  const transcript = page.getByLabel("Transcript");
  await expect(transcript).toHaveValue("this is my spoken answer");
  await transcript.fill("my corrected answer");
  await expect(page.getByText("Saved in this browser")).toBeVisible();
  const [text] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download transcript (.txt)" }).click()]);
  expect(text.suggestedFilename()).toMatch(/station-1\.txt$/);
  const contents = await readFile(await text.path(), "utf8");
  expect(contents).toContain("Describe a time you changed your mind.");
  expect(contents).toContain("my corrected answer");

  await page.reload();
  await expect(page.getByLabel("Transcript")).toHaveValue("my corrected answer");
  expect(outbound, "Nothing should be uploaded").toEqual([]);
});

test("moves from one station to the next by itself, with one question each", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await page.getByLabel("Stations", { exact: true }).fill("2");
  await setTime(page, "Preparation time", 0, 1);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "First question");
  await addOneOff(page, "Second question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByTestId("station-progress")).toHaveText("Station 1 of 2");
  await expect(page.getByTestId("question")).toHaveText("First question");
  await expect(page.getByTestId("station-progress")).toHaveText("Station 2 of 2", { timeout: 14_000 });
  await expect(page.getByTestId("question")).toHaveText("Second question");
  await waitForReview(page);

  await expect(page.getByText("First question")).toBeVisible();
  expect((await playerFacts(page, /station 1/)).duration).toBeGreaterThan(8.5);
  await page.getByLabel("Transcript").fill("edited station one");
  await page.getByRole("button", { name: "Station 2", exact: true }).click();
  await expect(page.getByText("Second question")).toBeVisible();
  expect((await playerFacts(page, /station 2/)).duration).toBeGreaterThan(8.5);
  await page.getByRole("button", { name: "Station 1", exact: true }).click();
  await expect(page.getByLabel("Transcript")).toHaveValue("edited station one");
});

test("explains a blocked camera and microphone, and can still run the timer", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "A question");
  await page.getByRole("button", { name: "Continue to device check" }).click();
  await page.getByRole("button", { name: "Turn on camera and microphone" }).click();
  await expect(page.getByText(/Camera: Access is blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  const start = page.getByRole("button", { name: "Start practice" });
  await expect(start).toBeDisabled();
  await page.getByLabel(/Continue without recording/).check();
  await start.click();
  await expect(page.getByText("Not recording in this session.")).toBeVisible();
  await waitForReview(page, 20_000);
  await expect(page.getByText("No recording for this station.")).toBeVisible();
});

test("continues with audio only when there's no camera", async ({ page }) => {
  await fakeSpeech(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.video) throw new DOMException("none", "NotFoundError");
      return original(constraints);
    };
  });
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "A question");
  await page.getByRole("button", { name: "Continue to device check" }).click();
  await page.getByRole("button", { name: "Turn on camera and microphone" }).click();
  await expect(page.getByText(/Camera: No device was found/)).toBeVisible();
  await page.getByRole("button", { name: "Start practice" }).click();
  await waitForReview(page, 20_000);
  await expect(page.locator("audio")).toBeVisible();
});

test("without speech recognition it still records, and offers a typed transcript", async ({ page }) => {
  await noSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await expect(page.getByText(/doesn't support live transcription/)).toBeVisible();
  await page.getByRole("button", { name: "Start practice" }).click();
  await waitForReview(page, 20_000);
  expect((await playerFacts(page)).duration).toBeGreaterThan(8.5);
  await expect(page.getByText(/You can type a transcript here/)).toBeVisible();
  await page.getByLabel("Transcript").fill("Typed by hand");
  await expect(page.getByText("Saved in this browser")).toBeVisible();
});

test("a speech recognition failure leaves the recording intact", async ({ page }) => {
  await page.addInitScript(() => {
    class Failing {
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onerror?.({ error: "not-allowed" });
          this.onend?.();
        }, 50);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, { webkitSpeechRecognition: Failing, SpeechRecognition: undefined });
  });
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.getByText(/Speech recognition was blocked/).first()).toBeVisible();
  await waitForReview(page, 20_000);
  expect((await playerFacts(page)).duration).toBeGreaterThan(8.5);
  await expect(page.getByText(/Speech recognition was blocked/)).toBeVisible();
});

test("a disconnected device warns, keeps the timer going, and reconnecting starts a new part", async ({ page }) => {
  await fakeSpeech(page);
  await exposeStream(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 20);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".rec")).toBeVisible();
  await page.waitForTimeout(5000);

  await page.evaluate(() => {
    const stream = (window as unknown as { lastStream: MediaStream }).lastStream;
    stream.getTracks().forEach((track) => {
      track.stop();
      track.dispatchEvent(new Event("ended"));
    });
  });
  await expect(page.getByRole("alert").filter({ hasText: "disconnected" })).toBeVisible();
  await expect(page.locator(".rec")).toBeHidden();
  await expect(page.getByTestId("phase-label")).toHaveText("Speak");

  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(page.locator(".rec")).toBeVisible();
  await waitForReview(page, 30_000);

  await expect(page.getByRole("button", { name: "Download recording", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download recording, part 2" })).toBeVisible();
  await expect(page.getByText(/disconnected|stopped unexpectedly/).first()).toBeVisible();
  expect((await playerFacts(page, /station 1$/)).duration).toBeGreaterThan(3);
});

test("reloading mid-session keeps what was already captured", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 2, 0);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".rec")).toBeVisible();
  await page.waitForTimeout(7000);

  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await waitForReview(page, 15_000);
  await expect(page.getByText(/stopped before it finished/)).toBeVisible();
  await expect(page.getByText(/page closed during this recording/)).toBeVisible();
  expect((await playerFacts(page)).duration).toBeGreaterThan(3);
  await expect(page.getByLabel("Transcript")).toHaveValue("this is my spoken answer");
});

test("ending a session early keeps the recording", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 2, 0);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".rec")).toBeVisible();
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();
  await waitForReview(page, 15_000);
  expect((await playerFacts(page)).duration).toBeGreaterThan(3);

  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByText("Ended early")).toBeVisible();
});

test("deleting a session removes it", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await waitForReview(page, 20_000);
  await page.getByRole("button", { name: "Delete session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Your questions" })).toBeVisible();
  await expect(page.getByText("Past practice")).toBeHidden();
});

// Uses simulated speech: this checks our own state handling, not real recognition.
test("a new station never shows the previous station's transcript", async ({ page }) => {
  await numberedFakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await page.getByLabel("Stations", { exact: true }).fill("2");
  await setTime(page, "Preparation time", 0, 3);
  await setTime(page, "Speaking time", 0, 10);
  await addOneOff(page, "First question");
  await addOneOff(page, "Second question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();

  const live = page.getByTestId("live-transcript");
  await expect(live).toContainText("words from recognition 1", { timeout: 8000 });
  await expect(page.getByTestId("station-progress")).toHaveText("Station 2 of 2", { timeout: 14_000 });
  await expect(page.getByTestId("phase-label")).toHaveText("Prepare");
  await expect(live).toBeHidden();
  await expect(page.getByTestId("phase-label")).toHaveText("Speak", { timeout: 6000 });
  await expect(live).not.toContainText("recognition 1");
  await expect(live).toContainText("words from recognition 2");

  await waitForReview(page);
  await expect(page.getByLabel("Transcript")).toHaveValue("words from recognition 1");
  await page.getByRole("button", { name: "Station 2", exact: true }).click();
  await expect(page.getByLabel("Transcript")).toHaveValue("words from recognition 2");
});

test("leaving a running interview always warns first", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 1, 0);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".rec")).toBeVisible();
  const runUrl = page.url();

  // No links to leave through.
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();

  // The Back button asks first, and asks every time.
  for (let press = 0; press < 2; press += 1) {
    await page.evaluate(() => history.back());
    const dialog = page.getByRole("dialog", { name: "End this session?" });
    await expect(dialog).toBeVisible();
    expect(page.url()).toBe(runUrl);
    await expect(page.locator(".rec")).toBeVisible();
    await dialog.getByRole("button", { name: "Keep going" }).click();
    await expect(dialog).toBeHidden();
  }

  // Closing or reloading the tab triggers the browser's own warning. Dismiss it and stay.
  const shown: string[] = [];
  page.on("dialog", (dialog) => {
    shown.push(dialog.type());
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => shown).toEqual(["beforeunload"]);
  expect(page.isClosed()).toBe(false);
  await expect(page.locator(".rec")).toBeVisible();
});

test("refreshing can't restart the clock: the session closes and stays closed", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/practice/setup/");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 2, 0);
  await addOneOff(page, "A question");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page.locator(".rec")).toBeVisible();
  await page.waitForTimeout(3000);
  const runUrl = page.url();

  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await waitForReview(page, 15_000);
  await expect(page.getByText(/stopped before it finished/)).toBeVisible();

  await page.goto(runUrl);
  await waitForReview(page, 15_000);
  await expect(page.getByTestId("countdown")).toHaveCount(0);
});

const IMPORTED = "A neighbour asks you to keep a secret that may harm someone else. What would you do?";

test("a question imported from a PDF can be used in timed practice with a one-off prompt", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/questions/");
  await page.getByRole("link", { name: "Import questions from a PDF" }).click();
  const input = page.getByLabel("PDF file");
  await expect(input).toBeEnabled();
  await input.setInputFiles({ name: "bank.pdf", mimeType: "application/pdf", buffer: await buildQuestionBank() });
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await page.getByRole("button", { name: /^Import \d+ questions$/ }).click();
  await expect(page.getByText(/Import complete\./)).toBeVisible({ timeout: 30_000 });

  await page.goto("/PracticeMMI/practice/setup/");
  await page.getByLabel("Stations", { exact: true }).fill("2");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await page.getByRole("checkbox", { name: IMPORTED }).check();
  await addOneOff(page, "A one-off prompt");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByTestId("question")).toHaveText(IMPORTED);
  await expect(page.locator(".rec")).toBeVisible();
  await expect(page.getByTestId("question")).toHaveText("A one-off prompt", { timeout: 14_000 });
  await waitForReview(page, 30_000);
  await expect(page.getByText(IMPORTED)).toBeVisible();
  expect((await playerFacts(page, /station 1/)).duration).toBeGreaterThan(8.5);
});

const library = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

async function addToLibrary(page: Page, text: string, difficulty: string, topics: string) {
  await page.getByRole("textbox", { name: "Question", exact: true }).fill(text);
  await page.getByLabel("Category").selectOption("policy");
  await page.getByLabel("Difficulty").selectOption(difficulty);
  await page.getByLabel("Topics (comma separated)").fill(topics);
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(library(page, text)).toBeVisible();
}

test("a session can mix a Firebase library question and a one-off prompt", async ({ page }) => {
  await fakeSpeech(page);
  await signInAndOpen(page, "/questions/");
  await addToLibrary(page, "A question from the library", "medium", "ethics");

  await page.goto("/PracticeMMI/practice/setup/");
  await page.getByLabel("Stations", { exact: true }).fill("2");
  await setTime(page, "Preparation time", 0, 0);
  await setTime(page, "Speaking time", 0, 10);
  await page.getByRole("checkbox", { name: "A question from the library" }).check();
  await addOneOff(page, "A one-off prompt");
  await continueAndCheckDevices(page);
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByTestId("question")).toHaveText("A question from the library");
  await expect(page.getByTestId("question")).toHaveText("A one-off prompt", { timeout: 14_000 });
  await waitForReview(page, 30_000);
  await expect(page.getByText("A question from the library")).toBeVisible();
  await page.getByRole("button", { name: "Station 2", exact: true }).click();
  await expect(page.getByText("A one-off prompt")).toBeVisible();

  // The one-off prompt never joins the library.
  await page.goto("/PracticeMMI/questions/");
  await expect(library(page, "A question from the library")).toBeVisible();
  await expect(page.getByText("A one-off prompt")).toHaveCount(0);
});

test("editing on the dashboard keeps the library fields it doesn't show", async ({ page }) => {
  await signInAndOpen(page, "/questions/");
  await addToLibrary(page, "Original wording", "hard", "consent, triage");

  await page.goto("/PracticeMMI/");
  await page.getByRole("button", { name: "Edit: Original wording" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Changed wording");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByRole("list", { name: "Question bank" }).getByText("Changed wording")).toBeVisible();

  await page.goto("/PracticeMMI/questions/");
  await expect(library(page, "Changed wording")).toContainText("Hard · consent · triage");
});
