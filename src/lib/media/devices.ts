// Camera and microphone access, and turning browser errors into plain causes.

import type { CaptureMode } from "@/lib/storage/sessions";

export type DeviceProblem = "denied" | "not_found" | "in_use" | "unsupported" | "unknown";

export const DEVICE_PROBLEM_TEXT: Record<DeviceProblem, string> = {
  denied: "Access is blocked. Allow the camera and microphone in your browser's site settings, then try again.",
  not_found: "No device was found. Check that it's connected, then try again.",
  in_use: "Another app is using this device. Close it, then try again.",
  unsupported: "This browser can't use cameras or microphones on this page. Use a recent browser over HTTPS.",
  unknown: "The device couldn't be started. Try again, or restart your browser.",
};

export function classifyDeviceError(error: unknown): DeviceProblem {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "not_found";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "in_use";
  return "unknown";
}

const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" };
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export interface DeviceCheckResult {
  stream: MediaStream | null;
  camera: DeviceProblem | null;
  microphone: DeviceProblem | null;
}

function stopped(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Asks for both devices together, so the browser shows one prompt. Only when a
 * device is missing or busy does it try each alone, to find out which one it
 * was. After a denial it doesn't ask again, which would stack prompts.
 */
export async function requestDevices(): Promise<DeviceCheckResult> {
  const media = globalThis.navigator?.mediaDevices;
  if (!media?.getUserMedia) return { stream: null, camera: "unsupported", microphone: "unsupported" };

  try {
    return { stream: await media.getUserMedia({ video: VIDEO, audio: AUDIO }), camera: null, microphone: null };
  } catch (error) {
    const problem = classifyDeviceError(error);
    if (problem === "denied") return { stream: null, camera: "denied", microphone: "denied" };
  }

  const attempt = async (constraints: MediaStreamConstraints) => {
    try {
      return { stream: await media.getUserMedia(constraints), problem: null };
    } catch (error) {
      return { stream: null, problem: classifyDeviceError(error) };
    }
  };
  const microphone = await attempt({ audio: AUDIO });
  const camera = await attempt({ video: VIDEO });
  if (!microphone.stream) {
    // A picture with no sound isn't a useful interview recording.
    stopped(camera.stream);
    return { stream: null, camera: camera.problem, microphone: microphone.problem };
  }
  if (camera.stream) {
    return { stream: new MediaStream([...microphone.stream.getTracks(), ...camera.stream.getTracks()]), camera: null, microphone: null };
  }
  return { stream: microphone.stream, camera: camera.problem, microphone: null };
}

/** Reopens the devices for a session already running, in the mode it started with. */
export async function reopenStream(mode: CaptureMode): Promise<MediaStream | null> {
  if (mode === "none") return null;
  const media = globalThis.navigator?.mediaDevices;
  if (!media?.getUserMedia) return null;
  try {
    return await media.getUserMedia(mode === "video" ? { video: VIDEO, audio: AUDIO } : { audio: AUDIO });
  } catch {
    return null;
  }
}

export function isStreamLive(stream: MediaStream | null, mode: CaptureMode): boolean {
  if (!stream || mode === "none") return false;
  const live = (tracks: MediaStreamTrack[]) => tracks.length > 0 && tracks.every((track) => track.readyState === "live");
  return live(stream.getAudioTracks()) && (mode === "audio" || live(stream.getVideoTracks()));
}

/** About 58 MB for a six-minute video answer. */
export const VIDEO_BITS_PER_SECOND = 1_200_000;
export const AUDIO_BITS_PER_SECOND = 96_000;

/** Bytes a session needs, so that a shortage shows up before it starts. */
export function estimateRecordingBytes(mode: CaptureMode, stations: number, speakSeconds: number): number {
  if (mode === "none") return 0;
  const bits = AUDIO_BITS_PER_SECOND + (mode === "video" ? VIDEO_BITS_PER_SECOND : 0);
  return Math.ceil((bits / 8) * speakSeconds * stations);
}

export interface StorageCheck {
  availableBytes: number | null;
  persisted: boolean;
}

export async function checkStorage(): Promise<StorageCheck> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) return { availableBytes: null, persisted: false };
  try {
    const estimate = await storage.estimate();
    const persisted = storage.persist ? await storage.persist() : false;
    const available = estimate.quota === undefined ? null : Math.max(0, estimate.quota - (estimate.usage ?? 0));
    return { availableBytes: available, persisted };
  } catch {
    return { availableBytes: null, persisted: false };
  }
}
