import { describe, expect, it, vi } from "vitest";
import { Transcriber, type Recognition, type TranscriberUpdate } from "@/lib/speech/transcriber";

class FakeRecognition implements Recognition {
  continuous = false;
  interimResults = false;
  lang = "";
  processLocally?: boolean;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  started = 0;
  start() {
    this.started += 1;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  say(results: Array<[string, boolean]>, resultIndex = 0) {
    this.onresult?.({
      resultIndex,
      results: Object.assign(
        results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
        { length: results.length },
      ) as never,
    });
  }
}

function setup(onDevice = false) {
  const instances: FakeRecognition[] = [];
  const updates: TranscriberUpdate[] = [];
  const timers: Array<() => void> = [];
  const transcriber = new Transcriber({
    onDevice,
    onUpdate: (update) => updates.push(update),
    create: () => {
      const instance = new FakeRecognition();
      instances.push(instance);
      return instance;
    },
    setTimer: (work) => timers.push(work),
  });
  const runTimers = () => timers.splice(0).forEach((work) => work());
  return { transcriber, instances, updates, runTimers, last: () => updates.at(-1)! };
}

describe("Transcriber", () => {
  it("configures continuous recognition and streams interim text", () => {
    const { transcriber, instances, last } = setup(true);
    transcriber.start();
    expect(instances[0]).toMatchObject({ continuous: true, interimResults: true, lang: "en-CA", processLocally: true, started: 1 });
    instances[0]!.say([["hello there", false]]);
    expect(last()).toMatchObject({ finalText: "", interimText: "hello there", state: "listening" });
  });

  it("does not repeat earlier results when the browser resends them", () => {
    const { transcriber, instances, last } = setup();
    transcriber.start();
    instances[0]!.say([["one", true]]);
    instances[0]!.say([["one", true], ["two", true]], 1);
    expect(last().finalText).toBe("one two");
  });

  it("restarts when recognition ends by itself, and keeps the earlier words", () => {
    const { transcriber, instances, runTimers, last } = setup();
    transcriber.start();
    instances[0]!.say([["first", true]]);
    instances[0]!.onend?.();
    runTimers();
    expect(instances).toHaveLength(2);
    instances[1]!.say([["second", true]]);
    expect(last().finalText).toBe("first second");
  });

  it("keeps restarting through long silence", () => {
    const { transcriber, instances, runTimers, last } = setup();
    transcriber.start();
    for (let i = 0; i < 20; i += 1) {
      instances.at(-1)!.onerror?.({ error: "no-speech" });
      instances.at(-1)!.onend?.();
      runTimers();
    }
    expect(instances).toHaveLength(21);
    expect(last().state).toBe("listening");
  });

  it("stops after repeated network failures and says why", () => {
    const { transcriber, instances, runTimers, last } = setup();
    transcriber.start();
    instances.at(-1)!.say([["kept", true]]);
    for (let i = 0; i < 6; i += 1) {
      instances.at(-1)!.onerror?.({ error: "network" });
      instances.at(-1)!.onend?.();
      runTimers();
    }
    expect(last()).toMatchObject({ state: "failed", finalText: "kept" });
    expect(last().message).toMatch(/couldn't be reached/);
    expect(instances).toHaveLength(6);
  });

  it("gives up at once when permission is refused", () => {
    const { transcriber, instances, runTimers, last } = setup();
    transcriber.start();
    instances[0]!.onerror?.({ error: "not-allowed" });
    instances[0]!.onend?.();
    runTimers();
    expect(instances).toHaveLength(1);
    expect(last().state).toBe("failed");
  });

  it("keeps an unfinished phrase when stopped", async () => {
    const { transcriber, instances, last } = setup();
    transcriber.start();
    instances[0]!.say([["almost done", false]]);
    await transcriber.stop();
    expect(last()).toMatchObject({ finalText: "almost done", interimText: "", state: "stopped" });
  });

  it("reports when the browser has no speech recognition", () => {
    const updates = vi.fn();
    new Transcriber({ onUpdate: updates }).start();
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ state: "unsupported" }));
  });
});
