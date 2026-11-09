import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StationRecorder, STORAGE_FULL_NOTE, pickMimeType, type RecorderStore } from "@/lib/media/recorder";
import type { RecordingMeta } from "@/lib/storage/sessions";

class FakeMediaRecorder {
  static last: FakeMediaRecorder;
  static isTypeSupported = (type: string) => type === "video/webm" || type === "audio/webm";
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  timeslice = 0;
  constructor(
    readonly stream: unknown,
    readonly options: MediaRecorderOptions,
  ) {
    FakeMediaRecorder.last = this;
  }
  start(timeslice: number) {
    this.state = "recording";
    this.timeslice = timeslice;
  }
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }
  stop() {
    this.state = "inactive";
    this.emit("end");
    this.onstop?.();
  }
}

function stream(hasVideo = true) {
  return { getVideoTracks: () => (hasVideo ? [{}] : []) } as unknown as MediaStream;
}

function memoryStore() {
  const chunks: Array<[number, number]> = [];
  const metas: RecordingMeta[] = [];
  const store: RecorderStore = {
    saveRecordingMeta: async (meta) => void metas.push(meta),
    appendChunk: async (_id, seq, blob) => void chunks.push([seq, blob.size]),
  };
  return { store, chunks, metas };
}

function make(store: RecorderStore, onInterrupted = vi.fn(), now = () => 1000) {
  return new StationRecorder({ stream: stream(), sessionId: "s", station: 2, part: 1, store, onInterrupted, now });
}

beforeEach(() => vi.stubGlobal("MediaRecorder", FakeMediaRecorder));
afterEach(() => vi.unstubAllGlobals());

describe("pickMimeType", () => {
  it("prefers MP4 and falls back to WebM", () => {
    expect(pickMimeType(true, () => true)).toContain("video/mp4");
    expect(pickMimeType(true, (type) => type.startsWith("video/webm"))).toBe("video/webm;codecs=vp9,opus");
    expect(pickMimeType(false, (type) => type === "audio/webm")).toBe("audio/webm");
    expect(pickMimeType(true, () => false)).toBeNull();
  });
});

describe("StationRecorder", () => {
  it("writes chunks every two seconds and finishes complete", async () => {
    const { store, chunks, metas } = memoryStore();
    let time = 1000;
    const recorder = make(store, vi.fn(), () => time);
    recorder.start();
    expect(FakeMediaRecorder.last.timeslice).toBe(2000);
    FakeMediaRecorder.last.emit("aa");
    time = 361_000;
    const meta = await recorder.stop();
    expect(chunks).toEqual([[0, 2], [1, 3]]);
    expect(meta).toMatchObject({ id: "s:2:1", status: "complete", durationMs: 360_000, sizeBytes: 5, note: null });
    expect(metas.at(-1)?.status).toBe("complete");
  });

  it("reports a browser error once and keeps what was captured", async () => {
    const { store, chunks } = memoryStore();
    const onInterrupted = vi.fn();
    const recorder = make(store, onInterrupted);
    recorder.start();
    FakeMediaRecorder.last.emit("aa");
    FakeMediaRecorder.last.onerror?.();
    FakeMediaRecorder.last.onerror?.();
    const meta = await recorder.stop();
    expect(onInterrupted).toHaveBeenCalledTimes(1);
    expect(meta.status).toBe("interrupted");
    expect(chunks.length).toBe(2);
  });

  it("treats the browser stopping by itself as an interruption", async () => {
    const { store } = memoryStore();
    const onInterrupted = vi.fn();
    const recorder = make(store, onInterrupted);
    recorder.start();
    FakeMediaRecorder.last.stop();
    expect((await recorder.stop()).status).toBe("interrupted");
    expect(onInterrupted).toHaveBeenCalledTimes(1);
  });

  it("stops cleanly when browser storage is full", async () => {
    const { store, metas } = memoryStore();
    store.appendChunk = async () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    const onInterrupted = vi.fn();
    const recorder = make(store, onInterrupted);
    recorder.start();
    FakeMediaRecorder.last.emit("aa");
    await vi.waitFor(() => expect(onInterrupted).toHaveBeenCalledWith(STORAGE_FULL_NOTE));
    await vi.waitFor(() => expect(metas.at(-1)).toMatchObject({ status: "interrupted", note: STORAGE_FULL_NOTE }));
  });

  it("throws when no format is supported", () => {
    (FakeMediaRecorder as { isTypeSupported: (type: string) => boolean }).isTypeSupported = () => false;
    const { store } = memoryStore();
    expect(() => make(store).start()).toThrow(/supported format/);
    FakeMediaRecorder.isTypeSupported = (type: string) => type === "video/webm" || type === "audio/webm";
  });
});
