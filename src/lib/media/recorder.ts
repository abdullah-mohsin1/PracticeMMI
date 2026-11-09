// One MediaRecorder per station. Data is written to the browser's disk every
// two seconds, so a crash or lost device costs seconds and not the whole answer.

import { AUDIO_BITS_PER_SECOND, VIDEO_BITS_PER_SECOND } from "@/lib/media/devices";
import type { RecordingMeta } from "@/lib/storage/sessions";

const TIMESLICE_MS = 2000;

// MP4 first where the browser can write it: it opens in QuickTime and on phones.
const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
const AUDIO_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

export function pickMimeType(hasVideo: boolean, isSupported: (type: string) => boolean): string | null {
  return (hasVideo ? VIDEO_TYPES : AUDIO_TYPES).find(isSupported) ?? null;
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined";
}

export interface RecorderStore {
  saveRecordingMeta(meta: RecordingMeta): Promise<void>;
  appendChunk(recordingId: string, seq: number, blob: Blob): Promise<void>;
}

export interface StationRecorderOptions {
  stream: MediaStream;
  sessionId: string;
  station: number;
  part: number;
  store: RecorderStore;
  /** Called once if the recording stops for any reason other than stop(). */
  onInterrupted: (reason: string) => void;
  now?: () => number;
}

export const STORAGE_FULL_NOTE = "Browser storage ran out, so recording stopped. Everything captured up to then was kept.";
const FAILED_NOTE = "Recording stopped unexpectedly. Everything captured up to then was kept.";

export class StationRecorder {
  private recorder: MediaRecorder | null = null;
  private meta: RecordingMeta | null = null;
  private seq = 0;
  private size = 0;
  private startedMs = 0;
  private writes: Promise<void> = Promise.resolve();
  private settled: Promise<RecordingMeta> | null = null;
  private resolveSettled: ((meta: RecordingMeta) => void) | null = null;
  private interruptedNote: string | null = null;
  private writeFailed = false;
  private stopCalled = false;
  private readonly now: () => number;

  constructor(private readonly options: StationRecorderOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Starts synchronously, so that recording begins exactly when the phase does. Throws if it can't. */
  start(): void {
    const { stream, sessionId, station, part, store } = this.options;
    const hasVideo = stream.getVideoTracks().length > 0;
    const mimeType = pickMimeType(hasVideo, (type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("This browser can't record in a supported format.");

    // Chrome's MP4 writer only hands over data at keyframes, so this interval
    // sets how much a crash can lose. Browsers that don't know it ignore it.
    const options: MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number } = {
      mimeType,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      ...(hasVideo ? { videoBitsPerSecond: VIDEO_BITS_PER_SECOND, videoKeyFrameIntervalDuration: TIMESLICE_MS } : {}),
    };
    const recorder = new MediaRecorder(stream, options);
    this.recorder = recorder;
    this.settled = new Promise((resolve) => (this.resolveSettled = resolve));
    this.startedMs = this.now();
    this.meta = {
      id: `${sessionId}:${station}:${part}`,
      sessionId,
      station,
      part,
      mimeType,
      status: "recording",
      startedAt: new Date(this.startedMs).toISOString(),
      durationMs: 0,
      sizeBytes: 0,
      note: null,
    };

    recorder.ondataavailable = (event) => this.write(event.data);
    recorder.onerror = () => this.interrupt(FAILED_NOTE);
    recorder.onstop = () => void this.finish();
    recorder.start(TIMESLICE_MS);
    this.enqueue(() => store.saveRecordingMeta(this.meta!));
  }

  /** Stops and resolves once every byte is on disk. */
  stop(): Promise<RecordingMeta> {
    this.stopCalled = true;
    this.halt();
    return this.settled ?? Promise.reject(new Error("Recording never started."));
  }

  /** Ends the recording as interrupted, for example when a device disconnects. */
  interrupt(note: string): void {
    if (this.interruptedNote || !this.recorder) return;
    if (this.meta?.status !== "recording") return;
    this.interruptedNote = note;
    this.halt();
    this.options.onInterrupted(note);
  }

  private halt(): void {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
  }

  private enqueue(work: () => Promise<void>): void {
    this.writes = this.writes.then(work).catch(() => {
      if (this.writeFailed) return;
      this.writeFailed = true;
      this.interrupt(STORAGE_FULL_NOTE);
    });
  }

  private write(blob: Blob): void {
    if (blob.size === 0 || this.writeFailed) return;
    const seq = this.seq;
    this.seq += 1;
    this.size += blob.size;
    this.enqueue(() => this.options.store.appendChunk(this.meta!.id, seq, blob));
  }

  private async finish(): Promise<void> {
    const meta = this.meta!;
    // The browser ended it by itself: every track died, for example.
    if (!this.interruptedNote && !this.stopCalled) {
      this.interruptedNote = FAILED_NOTE;
      this.options.onInterrupted(FAILED_NOTE);
    }
    await this.writes;
    const finished: RecordingMeta = {
      ...meta,
      status: this.interruptedNote ? "interrupted" : "complete",
      durationMs: this.now() - this.startedMs,
      sizeBytes: this.size,
      note: this.interruptedNote,
    };
    this.meta = finished;
    await this.options.store.saveRecordingMeta(finished).catch(() => undefined);
    this.resolveSettled?.(finished);
  }
}
