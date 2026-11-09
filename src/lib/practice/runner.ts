// Runs one practice session: moves through the phases and starts and stops
// capture. It has no React in it, and the clock is injected, so the whole
// sequence can be tested without waiting.

import { isStreamLive, reopenStream } from "@/lib/media/devices";
import { StationRecorder, type RecorderStore, type StationRecorderOptions } from "@/lib/media/recorder";
import { buildPhases, locatePhase, type Phase } from "@/lib/practice/timeline";
import { Transcriber, type TranscriberOptions, type TranscriberState } from "@/lib/speech/transcriber";
import {
  transcriptId,
  type PracticeSession,
  type RecordingMeta,
  type SessionStatus,
  type TranscriptRecord,
  type TranscriptStatus,
} from "@/lib/storage/sessions";

export interface RunnerStore extends RecorderStore {
  saveSession(session: PracticeSession): Promise<void>;
  saveTranscript(record: TranscriptRecord): Promise<void>;
}

export interface RecorderLike {
  start(): void;
  stop(): Promise<RecordingMeta>;
  interrupt(note: string): void;
}

export interface TranscriberLike {
  start(): void;
  stop(): Promise<void>;
}

export interface RunnerOptions {
  session: PracticeSession;
  stream: MediaStream | null;
  store: RunnerStore;
  onDeviceSpeech?: boolean;
  onChange: (snapshot: RunnerSnapshot) => void;
  now?: () => number;
  createRecorder?: (options: StationRecorderOptions) => RecorderLike;
  createTranscriber?: (options: TranscriberOptions) => TranscriberLike;
  reopen?: typeof reopenStream;
}

export interface RunnerSnapshot {
  state: "ready" | "running" | "saving" | "finished";
  phase: Phase | null;
  remainingMs: number;
  question: string | null;
  isRecording: boolean;
  finalTranscript: string;
  interimTranscript: string;
  transcriptMessage: string | null;
  warning: string | null;
  canReconnect: boolean;
  stream: MediaStream | null;
}

const STATUS_FOR_STATE: Record<TranscriberState, TranscriptStatus> = {
  idle: "listening",
  listening: "listening",
  stopped: "complete",
  unsupported: "unsupported",
  failed: "failed",
};

const DISCONNECTED = "Your camera or microphone disconnected. The timer is still running.";
const CANNOT_RECONNECT = "We still can't reach your camera or microphone. The timer is still running.";
const RECORDER_FAILED = "Recording couldn't start for this station. The timer is still running.";
const MISSED = "The browser was asleep or suspended during this station's speaking time.";

export class PracticeRunner {
  private readonly phases: Phase[];
  private readonly now: () => number;
  private session: PracticeSession;
  private stream: MediaStream | null;
  private startedAt = 0;
  private index = -1;
  private ended = false;
  private recorder: RecorderLike | null = null;
  private transcriber: TranscriberLike | null = null;
  private parts = new Map<number, number>();
  private pending = new Set<Promise<unknown>>();
  private transcriptWrites: Promise<unknown> = Promise.resolve();
  private snapshot: RunnerSnapshot;
  private reconnecting = false;

  constructor(private readonly options: RunnerOptions) {
    this.session = options.session;
    this.stream = options.stream;
    this.phases = buildPhases(options.session.config);
    this.now = options.now ?? Date.now;
    this.snapshot = {
      state: "ready",
      phase: null,
      remainingMs: 0,
      question: null,
      isRecording: false,
      finalTranscript: "",
      interimTranscript: "",
      transcriptMessage: null,
      warning: null,
      canReconnect: false,
      stream: options.stream,
    };
  }

  get current(): RunnerSnapshot {
    return this.snapshot;
  }

  start(): void {
    this.startedAt = this.now();
    this.session = { ...this.session, status: "running", startedAt: new Date(this.startedAt).toISOString() };
    this.track(this.options.store.saveSession(this.session));
    this.watchTracks(this.stream);
    this.update({ state: "running" });
    this.tick();
  }

  /** Safe to call as often as needed. The time decides what happens, not the number of calls. */
  tick(): void {
    if (this.ended || this.snapshot.state !== "running") return;
    const location = locatePhase(this.phases, this.now() - this.startedAt);
    if (!location) {
      void this.finish("completed");
      return;
    }
    if (location.index !== this.index) {
      this.leaveCurrent();
      this.markSkipped(this.index + 1, location.index);
      this.index = location.index;
      this.enter(location.phase);
    }
    this.update({ phase: location.phase, remainingMs: location.remainingMs });
  }

  endEarly(): Promise<void> {
    return this.finish("ended_early");
  }

  async reconnect(): Promise<void> {
    if (this.ended || this.reconnecting) return;
    this.reconnecting = true;
    const opened = await (this.options.reopen ?? reopenStream)(this.session.captureMode);
    this.reconnecting = false;
    if (this.ended) {
      opened?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (!opened) {
      this.update({ warning: CANNOT_RECONNECT, canReconnect: true });
      return;
    }
    this.replaceStream(opened);
    this.update({ warning: null, canReconnect: false, stream: opened });
    const phase = this.phases[this.index];
    if (phase?.kind === "speak" && !this.recorder) this.beginRecording(phase.station);
  }

  /** Releases the devices if the page goes away part-way through. */
  dispose(): void {
    if (this.ended) return;
    this.ended = true;
    void this.recorder?.stop().catch(() => undefined);
    void this.transcriber?.stop();
    this.releaseStream();
  }

  private enter(phase: Phase): void {
    const question = phase.kind === "break" ? null : (this.session.stations[phase.station - 1]?.text ?? null);
    this.update({ question, finalTranscript: "", interimTranscript: "", transcriptMessage: null });
    if (phase.kind !== "speak") return;
    this.beginTranscript(phase.station);
    if (this.session.captureMode === "none") return;
    if (isStreamLive(this.stream, this.session.captureMode)) this.beginRecording(phase.station);
    else void this.reconnect();
  }

  private leaveCurrent(): void {
    const phase = this.phases[this.index];
    if (phase?.kind !== "speak") return;
    if (this.recorder) this.track(this.recorder.stop());
    this.recorder = null;
    if (this.transcriber) this.track(this.transcriber.stop());
    this.transcriber = null;
    this.update({ isRecording: false });
  }

  private beginRecording(station: number): void {
    const part = (this.parts.get(station) ?? 0) + 1;
    const recorderOptions: StationRecorderOptions = {
      stream: this.stream!,
      sessionId: this.session.id,
      station,
      part,
      store: this.options.store,
      now: this.now,
      onInterrupted: (note) => this.onRecorderInterrupted(recorder, note),
    };
    const recorder = this.options.createRecorder?.(recorderOptions) ?? new StationRecorder(recorderOptions);
    try {
      recorder.start();
    } catch {
      this.update({ warning: RECORDER_FAILED });
      return;
    }
    this.parts.set(station, part);
    this.recorder = recorder;
    this.update({ isRecording: true });
  }

  private onRecorderInterrupted(recorder: RecorderLike, note: string): void {
    this.track(recorder.stop());
    if (this.recorder === recorder) this.recorder = null;
    this.update({ isRecording: false, warning: note, canReconnect: this.session.captureMode !== "none" });
  }

  private beginTranscript(station: number): void {
    const base = { id: transcriptId(this.session.id, station), sessionId: this.session.id, station, edited: false };
    const write = (text: string, status: TranscriptStatus, message: string | null) => {
      const record: TranscriptRecord = { ...base, text, status, message, updatedAt: new Date(this.now()).toISOString() };
      // Chained, so that the last update is always the one that sticks.
      this.transcriptWrites = this.transcriptWrites.then(() => this.options.store.saveTranscript(record)).catch(() => undefined);
    };
    if (!this.session.transcriptionEnabled) {
      write("", "off", null);
      return;
    }
    let saved = "";
    let savedStatus: TranscriptStatus | null = null;
    const transcriberOptions: TranscriberOptions = {
      onDevice: this.options.onDeviceSpeech,
      onUpdate: (update) => {
        const status = STATUS_FOR_STATE[update.state];
        if (update.finalText !== saved || status !== savedStatus) {
          saved = update.finalText;
          savedStatus = status;
          write(update.finalText, status, update.message);
        }
        if (this.transcriber === transcriber) {
          this.update({ finalTranscript: update.finalText, interimTranscript: update.interimText, transcriptMessage: update.message });
        }
      },
    };
    const transcriber: TranscriberLike = this.options.createTranscriber?.(transcriberOptions) ?? new Transcriber(transcriberOptions);
    this.transcriber = transcriber;
    try {
      transcriber.start();
    } catch {
      this.transcriber = null;
      write("", "failed", "Live transcription couldn't start.");
    }
  }

  private markSkipped(from: number, to: number): void {
    for (let index = from; index < to; index += 1) {
      const phase = this.phases[index];
      if (phase?.kind !== "speak") continue;
      const record: TranscriptRecord = {
        id: transcriptId(this.session.id, phase.station),
        sessionId: this.session.id,
        station: phase.station,
        text: "",
        status: "failed",
        message: MISSED,
        edited: false,
        updatedAt: new Date(this.now()).toISOString(),
      };
      this.transcriptWrites = this.transcriptWrites.then(() => this.options.store.saveTranscript(record)).catch(() => undefined);
    }
  }

  private async finish(status: SessionStatus): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.update({ state: "saving", phase: null, remainingMs: 0 });
    this.leaveCurrent();
    await Promise.allSettled(this.pending);
    await this.transcriptWrites;
    this.session = { ...this.session, status, endedAt: new Date(this.now()).toISOString() };
    await this.options.store.saveSession(this.session).catch(() => undefined);
    this.releaseStream();
    this.update({ state: "finished", stream: null });
  }

  private readonly onTrackEnded = (): void => {
    if (this.ended) return;
    if (this.recorder) this.recorder.interrupt(DISCONNECTED);
    else this.update({ warning: DISCONNECTED, canReconnect: true });
  };

  private watchTracks(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.addEventListener("ended", this.onTrackEnded));
  }

  private replaceStream(next: MediaStream): void {
    this.releaseStream();
    this.stream = next;
    this.watchTracks(next);
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => {
      track.removeEventListener("ended", this.onTrackEnded);
      track.stop();
    });
    this.stream = null;
  }

  private track(work: Promise<unknown>): void {
    const tracked: Promise<unknown> = work.catch(() => undefined).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  private update(patch: Partial<RunnerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onChange(this.snapshot);
  }
}
