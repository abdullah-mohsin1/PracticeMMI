// Runs a practice session in real Chrome and hides its tab for six minutes.
// Playwright can't test this: it forces every page to report as visible and
// turns off background throttling. Needs a build in out/. Transcription is
// switched off, so Chrome's speech service never touches the real microphone.
//   node scripts/check-hidden-tab.mjs
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HIDDEN_SECONDS = Number(process.env.HIDDEN_SECONDS ?? 360);
const SPEAK_SECONDS = HIDDEN_SECONDS + 30;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const debugPort = 9333;
const webPort = 8790;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn("node", ["scripts/serve-static.mjs"], { env: { ...process.env, PORT: String(webPort) }, stdio: "ignore" });
const profile = await mkdtemp(join(tmpdir(), "practicemmi-"));
const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, "--no-first-run", "--no-default-browser-check", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "about:blank"], { stdio: "ignore" });

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const waiting = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  };
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      waiting.set(nextId, (message) => (message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)));
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
}

async function json(path) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await (await fetch(`http://127.0.0.1:${debugPort}${path}`)).json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Chrome did not start.");
}

let failed = false;
try {
  const version = await json("/json/version");
  const browser = await connect(version.webSocketDebuggerUrl);
  const target = (await json("/json/list")).find((item) => item.type === "page");
  const page = await connect(target.webSocketDebuggerUrl);
  const run = async (expression) => {
    const { result, exceptionDetails } = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const waitFor = async (expression, timeoutMs = 20_000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await run(expression).catch(() => false)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  const click = (name) => run(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)}).click()`);
  const hasButton = (name) => `[...document.querySelectorAll("button")].some((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
  const set = (selector, value) =>
    run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const label = `document.querySelector('[data-testid="phase-label"]')?.textContent`;
  const countdown = async () => {
    const [minutes, seconds] = (await run(`document.querySelector('[data-testid="countdown"]').textContent`)).split(":").map(Number);
    return minutes * 60 + seconds;
  };
  const visibility = () => run("document.visibilityState");

  await page("Page.enable");
  await page("Page.navigate", { url: `http://127.0.0.1:${webPort}/practice/setup/` });
  await waitFor(`Boolean(document.querySelector("#one-off"))`);
  await set("#prep-minutes", 0);
  await set("#prep-seconds", 2);
  await set("#speak-minutes", Math.floor(SPEAK_SECONDS / 60));
  await set("#speak-seconds", SPEAK_SECONDS % 60);
  await set("#one-off", "Hidden tab check");
  await waitFor(hasButton("Add to this session"));
  await click("Add to this session");
  await waitFor(`!document.querySelector('button.btn-primary:not(.btn-small)').disabled`);
  await click("Continue to device check");
  await waitFor(hasButton("Turn on camera and microphone"));
  await click("Turn on camera and microphone");
  await waitFor(`document.body.innerText.includes("Camera: working")`);
  await run(`(() => { const box = document.querySelector('input[type="checkbox"]'); if (box?.checked) box.click(); })()`);
  await waitFor(`document.querySelector('input[type="checkbox"]')?.checked === false`);
  await click("Start practice");
  await waitFor(`${label} === "Speak"`, 8000);
  const speakingStarted = Date.now();
  await waitFor(`Boolean(document.querySelector(".rec"))`);

  const { targetId } = await browser("Target.createTarget", { url: "about:blank" });
  await waitFor(`document.visibilityState === "hidden"`, 8000);
  console.log("tab is hidden:", await visibility());
  const elapsed = () => (Date.now() - speakingStarted) / 1000;
  while (elapsed() < HIDDEN_SECONDS) {
    await sleep(Math.min(60_000, (HIDDEN_SECONDS - elapsed()) * 1000 + 50));
    console.log(`t=${elapsed().toFixed(0)}s visibility=${await visibility()} shown=${await countdown()} expected=${(SPEAK_SECONDS - elapsed()).toFixed(1)}`);
  }
  await page("Page.bringToFront");
  await browser("Target.closeTarget", { targetId });
  await waitFor(`document.visibilityState === "visible"`, 8000);
  await sleep(300);
  const shown = await countdown();
  const expected = SPEAK_SECONDS - elapsed();
  const stillRecording = await run(`Boolean(document.querySelector(".rec"))`);
  console.log(`back on the tab: shown=${shown}s expected=${expected.toFixed(1)}s recording=${stillRecording}`);

  await waitFor(`document.body.innerText.includes("Review your practice")`, 60_000);
  await waitFor(`(() => { const v = document.querySelector("video.player"); return v && Number.isFinite(v.duration) && v.duration > 0 && !v.seeking && v.currentTime === 0; })()`, 30_000);
  const duration = await run(`document.querySelector("video.player").duration`);
  console.log(`recording length: ${duration.toFixed(2)}s, wanted ${SPEAK_SECONDS}s`);
  failed = Math.abs(shown - expected) >= 2 || !stillRecording || Math.abs(duration - SPEAK_SECONDS) >= 3;
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  chrome.kill();
  server.kill();
  await sleep(1000);
  await rm(profile, { recursive: true, force: true });
}
console.log(failed ? "FAILED" : "PASSED");
process.exit(failed ? 1 : 0);
