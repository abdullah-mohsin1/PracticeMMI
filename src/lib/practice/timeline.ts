// Pure timing rules. The current phase is always derived from the start time,
// so a throttled timer or a hidden tab can never stretch a station.

export const MIN_STATIONS = 1;
export const MAX_STATIONS = 12;
export const MOCK_STATIONS = 8;
export const MOCK_BREAK_AFTER = 4;
export const MOCK_BREAK_SECONDS = 120;
export const DEFAULT_PREP_SECONDS = 120;
export const DEFAULT_SPEAK_SECONDS = 360;
export const MAX_PREP_SECONDS = 30 * 60;
export const MIN_SPEAK_SECONDS = 10;
export const MAX_SPEAK_SECONDS = 30 * 60;

export type PracticeMode = "custom" | "mock";

export interface PracticeConfig {
  mode: PracticeMode;
  stationCount: number;
  prepSeconds: number;
  speakSeconds: number;
  breakAfter: number | null;
  breakSeconds: number;
}

export interface ConfigErrors {
  stationCount?: string;
  prepSeconds?: string;
  speakSeconds?: string;
}

export function makeConfig(mode: PracticeMode, stationCount: number, prepSeconds: number, speakSeconds: number): PracticeConfig {
  return mode === "mock"
    ? { mode, stationCount: MOCK_STATIONS, prepSeconds, speakSeconds, breakAfter: MOCK_BREAK_AFTER, breakSeconds: MOCK_BREAK_SECONDS }
    : { mode, stationCount, prepSeconds, speakSeconds, breakAfter: null, breakSeconds: 0 };
}

export function validateConfig(config: PracticeConfig): ConfigErrors {
  const errors: ConfigErrors = {};
  const { stationCount, prepSeconds, speakSeconds } = config;
  if (!Number.isInteger(stationCount) || stationCount < MIN_STATIONS || stationCount > MAX_STATIONS) {
    errors.stationCount = `Choose between ${MIN_STATIONS} and ${MAX_STATIONS} stations.`;
  }
  if (!Number.isInteger(prepSeconds) || prepSeconds < 0 || prepSeconds > MAX_PREP_SECONDS) {
    errors.prepSeconds = "Preparation can be from 0 to 30 minutes.";
  }
  if (!Number.isInteger(speakSeconds) || speakSeconds < MIN_SPEAK_SECONDS || speakSeconds > MAX_SPEAK_SECONDS) {
    errors.speakSeconds = `Speaking time can be from ${MIN_SPEAK_SECONDS} seconds to 30 minutes.`;
  }
  return errors;
}

export type Phase =
  | { kind: "prep" | "speak"; station: number; startMs: number; endMs: number }
  | { kind: "break"; afterStation: number; startMs: number; endMs: number };

/** Offsets are milliseconds from the start of the session. Zero-length phases are left out. */
export function buildPhases(config: PracticeConfig): Phase[] {
  const phases: Phase[] = [];
  let cursor = 0;
  const push = (durationSeconds: number, phase: (startMs: number, endMs: number) => Phase) => {
    if (durationSeconds <= 0) return;
    const end = cursor + durationSeconds * 1000;
    phases.push(phase(cursor, end));
    cursor = end;
  };
  for (let station = 1; station <= config.stationCount; station += 1) {
    push(config.prepSeconds, (startMs, endMs) => ({ kind: "prep", station, startMs, endMs }));
    push(config.speakSeconds, (startMs, endMs) => ({ kind: "speak", station, startMs, endMs }));
    if (config.breakAfter === station && station < config.stationCount) {
      push(config.breakSeconds, (startMs, endMs) => ({ kind: "break", afterStation: station, startMs, endMs }));
    }
  }
  return phases;
}

export function totalSeconds(config: PracticeConfig): number {
  const last = buildPhases(config).at(-1);
  return last ? last.endMs / 1000 : 0;
}

export interface PhaseLocation {
  index: number;
  phase: Phase;
  remainingMs: number;
}

/** Returns null once the session is over. */
export function locatePhase(phases: readonly Phase[], elapsedMs: number): PhaseLocation | null {
  const at = Math.max(0, elapsedMs);
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index]!;
    if (at < phase.endMs) return { index, phase, remainingMs: phase.endMs - at };
  }
  return null;
}

/** Rounds up, so 0:01 shows for the final second and 0:00 only at the transition. */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest} sec`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}
