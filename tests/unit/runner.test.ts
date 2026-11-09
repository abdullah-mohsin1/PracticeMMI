import { describe, expect, it, vi } from "vitest";
import type { StationRecorderOptions } from "@/lib/media/recorder";
import { PracticeRunner, type RecorderLike, type RunnerSnapshot, type RunnerStore } from "@/lib/practice/runner";
import { makeConfig } from "@/lib/practice/timeline";
import type { TranscriberOptions } from "@/lib/speech/transcriber";
import type { CaptureMode, PracticeSession, RecordingMeta, TranscriptRecord } from "@/lib/storage/sessions";

function liveStream() {
  const listeners = new Set<() => void>();
  const track = {
    readyState: "live",
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    stop: vi.fn(),
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track, disconnect: () => { track.readyState = "ended"; listeners.forEach((listener) => listener()); } };
}

function setup({ stations = 2, mode = "custom" as "custom" | "mock", capture = "video" as CaptureMode, transcribe = true, reopen = vi.fn(async () => null as MediaStream | null) } = {}) {
  const config = makeConfig(mode, stations, 60, 120);
  const session: PracticeSession = {
    id: "s",
    ownerId: "me",
    config,
    stations: Array.from({ length: config.stationCount }, (_, i) => ({ station: i + 1, questionId: null, text: `Question ${i + 1}` })),
    status: "draft",
    captureMode: capture,
    transcriptionEnabled: transcribe,
    createdAt: "x",
    startedAt: null,
    endedAt: null,
  };
  let time = 1_000_000;
  const started: Array<StationRecorderOptions & RecorderLike> = [];
  const stopped: number[] = [];
  const sessions: PracticeSession[] = [];
  const transcripts: TranscriptRecord[] = [];
  const transcribers: TranscriberOptions[] = [];
  const store: RunnerStore = {
    saveSession: async (row) => void sessions.push(row),
    saveTranscript: async (row) => void transcripts.push(row),
    saveRecordingMeta: async () => undefined,
    appendChunk: async () => undefined,
  };
  const device = liveStream();
  let snapshot!: RunnerSnapshot;
  const runner = new PracticeRunner({
    session,
    stream: capture === "none" ? null : device.stream,
    store,
    onChange: (next) => (snapshot = next),
    now: () => time,
    reopen,
    createRecorder: (options) => {
      const recorder = Object.assign({}, options, {
        start: vi.fn(),
        stop: vi.fn(async () => {
          stopped.push(options.station);
          return {} as RecordingMeta;
        }),
        interrupt: vi.fn((note: string) => options.onInterrupted(note)),
      });
      started.push(recorder);
      return recorder;
    },
    createTranscriber: (options) => {
      transcribers.push(options);
      return { start: vi.fn(), stop: vi.fn(async () => options.onUpdate({ finalText: "words", interimText: "", state: "stopped", message: null })) };
    },
  });
  const go = (ms: number) => {
    time += ms;
    runner.tick();
  };
  return { runner, go, started, stopped, sessions, transcripts, transcribers, device, get snapshot() { return snapshot; } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PracticeRunner", () => {
  it("advances through preparation and speaking, recording only while speaking", async () => {
    const t = setup();
    t.runner.start();
    expect(t.snapshot).toMatchObject({ phase: { kind: "prep", station: 1 }, question: "Question 1", isRecording: false, remainingMs: 60_000 });
    t.go(59_999);
    expect(t.started).toHaveLength(0);
    t.go(1);
    expect(t.snapshot).toMatchObject({ phase: { kind: "speak", station: 1 }, isRecording: true, remainingMs: 120_000 });
    expect(t.started.map((r) => [r.station, r.part])).toEqual([[1, 1]]);
    t.go(120_000);
    expect(t.snapshot).toMatchObject({ phase: { kind: "prep", station: 2 }, question: "Question 2", isRecording: false });
    expect(t.stopped).toEqual([1]);
    t.go(60_000);
    t.go(120_000);
    await settle();
    expect(t.snapshot.state).toBe("finished");
    expect(t.sessions.at(-1)?.status).toBe("completed");
    expect(t.device.track.stop).toHaveBeenCalled();
    expect(t.transcripts.at(-1)).toMatchObject({ station: 2, text: "words", status: "complete" });
  });

  it("takes the 2-minute break after station 4 in a full mock, without recording", () => {
    const t = setup({ mode: "mock" });
    t.runner.start();
    t.go(4 * 180_000);
    expect(t.snapshot).toMatchObject({ phase: { kind: "break", afterStation: 4 }, question: null, isRecording: false, remainingMs: 120_000 });
    t.go(120_000);
    expect(t.snapshot).toMatchObject({ phase: { kind: "prep", station: 5 }, question: "Question 5" });
  });

  it("keeps time from the clock when timers are delayed", () => {
    const t = setup();
    t.runner.start();
    t.go(90_000);
    expect(t.snapshot).toMatchObject({ phase: { kind: "speak", station: 1 }, remainingMs: 90_000 });
  });

  it("marks a station as missed when the browser slept through it", async () => {
    const t = setup();
    t.runner.start();
    t.go(240_000 + 30_000);
    await settle();
    expect(t.snapshot.phase).toMatchObject({ kind: "speak", station: 2 });
    expect(t.transcripts.find((row) => row.station === 1)).toMatchObject({ status: "failed", message: expect.stringMatching(/asleep/) });
    expect(t.started.map((r) => r.station)).toEqual([2]);
  });

  it("warns and keeps the timer running when a device disconnects, then records a new part after reconnecting", async () => {
    const replacement = liveStream();
    const reopen = vi.fn(async () => replacement.stream as MediaStream | null);
    const t = setup({ reopen });
    t.runner.start();
    t.go(60_000);
    t.device.disconnect();
    expect(t.snapshot).toMatchObject({ isRecording: false, canReconnect: true, warning: expect.stringMatching(/disconnected/) });
    t.go(1000);
    expect(t.snapshot.phase).toMatchObject({ kind: "speak", station: 1 });
    await t.runner.reconnect();
    expect(t.snapshot).toMatchObject({ isRecording: true, warning: null, stream: replacement.stream });
    expect(t.started.map((r) => r.part)).toEqual([1, 2]);
  });

  it("keeps offering to reconnect if the device is still gone", async () => {
    const t = setup();
    t.runner.start();
    t.go(60_000);
    t.device.disconnect();
    await t.runner.reconnect();
    expect(t.snapshot).toMatchObject({ canReconnect: true, warning: expect.stringMatching(/still can't/) });
  });

  it("tries to reconnect by itself when a speaking phase starts with a dead device", async () => {
    const reopen = vi.fn(async () => null as MediaStream | null);
    const t = setup({ reopen });
    t.runner.start();
    t.device.disconnect();
    t.go(60_000);
    await settle();
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(t.snapshot.phase).toMatchObject({ kind: "speak" });
  });

  it("runs the timer with no recording in no-capture mode", () => {
    const t = setup({ capture: "none" });
    t.runner.start();
    t.go(60_000);
    expect(t.snapshot).toMatchObject({ phase: { kind: "speak" }, isRecording: false, warning: null });
    expect(t.started).toHaveLength(0);
  });

  it("records 'off' when transcription isn't wanted", async () => {
    const t = setup({ transcribe: false });
    t.runner.start();
    t.go(60_000);
    await settle();
    expect(t.transcribers).toHaveLength(0);
    expect(t.transcripts[0]).toMatchObject({ status: "off" });
  });

  it("saves everything when ended early", async () => {
    const t = setup();
    t.runner.start();
    t.go(60_000);
    await t.runner.endEarly();
    expect(t.stopped).toEqual([1]);
    expect(t.sessions.at(-1)?.status).toBe("ended_early");
    expect(t.snapshot.state).toBe("finished");
  });
});
