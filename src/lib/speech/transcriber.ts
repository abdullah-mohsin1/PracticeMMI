// Browser speech recognition, treated as a best-effort extra. Support differs
// by browser, recognition ends by itself every so often, and any failure here
// must never affect the timer or the recording.

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionResultEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  error: string;
}

export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognitionConstructor {
  new (): Recognition;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
}

function constructorFromGlobals(): RecognitionConstructor | null {
  const scope = globalThis as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return constructorFromGlobals() !== null;
}

export const LANGUAGE = "en-CA";

/** True when this browser has already got an on-device model, so audio needn't leave it. */
export async function isOnDeviceSpeechReady(): Promise<boolean> {
  const available = constructorFromGlobals()?.available;
  if (!available) return false;
  try {
    return (await available.call(constructorFromGlobals(), { langs: [LANGUAGE], processLocally: true })) === "available";
  } catch {
    return false;
  }
}

export type TranscriberState = "idle" | "listening" | "stopped" | "unsupported" | "failed";

export interface TranscriberUpdate {
  finalText: string;
  interimText: string;
  state: TranscriberState;
  message: string | null;
}

const FATAL: Record<string, string> = {
  "not-allowed": "Speech recognition was blocked in this browser, so no transcript was made.",
  "service-not-allowed": "This browser doesn't allow speech recognition here, so no transcript was made.",
  "language-not-supported": "This browser can't transcribe this language.",
  "audio-capture": "Speech recognition couldn't use the microphone.",
};

const MAX_RESTARTS_WITHOUT_RESULT = 6;
const RESTART_DELAY_MS = 250;
const STOP_GRACE_MS = 1500;

export interface TranscriberOptions {
  onUpdate: (update: TranscriberUpdate) => void;
  onDevice?: boolean;
  create?: () => Recognition;
  setTimer?: (work: () => void, ms: number) => unknown;
}

export class Transcriber {
  private recognition: Recognition | null = null;
  private committed: string[] = [];
  private session: Map<number, string> = new Map();
  private interim = "";
  private state: TranscriberState = "idle";
  private message: string | null = null;
  private wantRunning = false;
  private restartsWithoutResult = 0;
  private lastError: string | null = null;
  private resolveStop: (() => void) | null = null;
  private readonly setTimer: (work: () => void, ms: number) => unknown;

  constructor(private readonly options: TranscriberOptions) {
    this.setTimer = options.setTimer ?? ((work, ms) => setTimeout(work, ms));
  }

  get text(): string {
    return [...this.committed, ...this.session.values()].join(" ").replace(/\s+/g, " ").trim();
  }

  start(): void {
    const Constructor = constructorFromGlobals();
    if (!this.options.create && !Constructor) {
      this.state = "unsupported";
      this.message = "This browser doesn't support live transcription.";
      this.emit();
      return;
    }
    this.create = this.options.create ?? (() => new Constructor!());
    this.wantRunning = true;
    this.state = "listening";
    this.emit();
    this.launch();
  }

  private create: () => Recognition = () => {
    throw new Error("Not started.");
  };

  /** Stops listening and waits briefly for the last words to arrive. */
  stop(): Promise<void> {
    this.wantRunning = false;
    if (!this.recognition) {
      this.settle();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.resolveStop = resolve;
      try {
        this.recognition?.stop();
      } catch {
        this.settle();
      }
      this.setTimer(() => this.settle(), STOP_GRACE_MS);
    });
  }

  private launch(): void {
    if (!this.wantRunning) return;
    const recognition = this.create();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANGUAGE;
    if (this.options.onDevice) recognition.processLocally = true;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event.error);
    recognition.onend = () => this.handleEnd();
    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.scheduleRestart();
    }
  }

  private handleResult(event: RecognitionResultEvent): void {
    this.restartsWithoutResult = 0;
    this.lastError = null;
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]!;
      const words = result[0]?.transcript.trim() ?? "";
      if (result.isFinal) {
        if (words) this.session.set(index, words);
      } else {
        interim += `${words} `;
      }
    }
    this.interim = interim.trim();
    this.emit();
  }

  private handleError(code: string): void {
    this.lastError = code;
    const fatal = FATAL[code];
    if (!fatal) return;
    this.wantRunning = false;
    this.state = "failed";
    this.message = fatal;
    this.emit();
  }

  private handleEnd(): void {
    // Each recognition session numbers its results from zero, so bank them.
    this.committed.push(...this.session.values());
    this.session = new Map();
    // A final phrase can be cut off while still marked interim. Keep it.
    if (this.interim) this.committed.push(this.interim);
    this.interim = "";
    this.recognition = null;

    if (this.wantRunning) {
      this.scheduleRestart();
      return;
    }
    this.settle();
  }

  private scheduleRestart(): void {
    // Silence alone ends a recognition session and isn't a failure.
    if (this.lastError && this.lastError !== "no-speech" && this.lastError !== "aborted") {
      this.restartsWithoutResult += 1;
    }
    if (this.restartsWithoutResult >= MAX_RESTARTS_WITHOUT_RESULT) {
      this.wantRunning = false;
      this.state = "failed";
      this.message =
        this.lastError === "network"
          ? "The speech service couldn't be reached, so transcription stopped. Your recording isn't affected."
          : "Transcription stopped working. Your recording isn't affected.";
      this.emit();
      return;
    }
    const delay = RESTART_DELAY_MS * (this.restartsWithoutResult + 1);
    this.emit();
    this.setTimer(() => this.launch(), delay);
  }

  private settle(): void {
    if (this.state === "listening") this.state = "stopped";
    this.emit();
    this.resolveStop?.();
    this.resolveStop = null;
  }

  private emit(): void {
    this.options.onUpdate({ finalText: this.text, interimText: this.interim, state: this.state, message: this.message });
  }
}
