import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyDeviceError, estimateRecordingBytes, isStreamLive, requestDevices } from "@/lib/media/devices";
import { extensionFor, stationFilename, transcriptFileText } from "@/lib/download";

function stubMedia(getUserMedia: unknown) {
  vi.stubGlobal("navigator", { mediaDevices: getUserMedia ? { getUserMedia } : undefined });
}
const named = (name: string) => Object.assign(new Error(name), { name });
const fakeStream = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

afterEach(() => vi.unstubAllGlobals());

describe("device access", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "not_found"],
    ["OverconstrainedError", "not_found"],
    ["NotReadableError", "in_use"],
    ["SomethingElse", "unknown"],
  ])("classifies %s", (name, expected) => {
    expect(classifyDeviceError(named(name))).toBe(expected);
  });

  it("reports an unsupported browser", async () => {
    stubMedia(undefined);
    expect(await requestDevices()).toEqual({ stream: null, camera: "unsupported", microphone: "unsupported" });
  });

  it("asks only once after a denial", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(named("NotAllowedError"));
    stubMedia(getUserMedia);
    expect(await requestDevices()).toEqual({ stream: null, camera: "denied", microphone: "denied" });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("falls back to audio only when the camera is missing", async () => {
    const audio = fakeStream();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (constraints.video) throw named("NotFoundError");
      return audio;
    });
    stubMedia(getUserMedia);
    expect(await requestDevices()).toEqual({ stream: audio, camera: "not_found", microphone: null });
  });

  it("gives up on the stream when the microphone is missing", async () => {
    const video = fakeStream();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (constraints.audio) throw named("NotReadableError");
      return video;
    });
    stubMedia(getUserMedia);
    expect(await requestDevices()).toEqual({ stream: null, camera: null, microphone: "in_use" });
  });

  it("checks that the tracks a mode needs are live", () => {
    const live = { readyState: "live" };
    const dead = { readyState: "ended" };
    const stream = (audio: object[], video: object[]) => ({ getAudioTracks: () => audio, getVideoTracks: () => video }) as unknown as MediaStream;
    expect(isStreamLive(stream([live], [live]), "video")).toBe(true);
    expect(isStreamLive(stream([live], [dead]), "video")).toBe(false);
    expect(isStreamLive(stream([live], []), "audio")).toBe(true);
    expect(isStreamLive(null, "audio")).toBe(false);
  });

  it("estimates storage for a full mock", () => {
    expect(estimateRecordingBytes("video", 8, 360)).toBe(((1_200_000 + 96_000) / 8) * 360 * 8);
    expect(estimateRecordingBytes("none", 8, 360)).toBe(0);
  });
});

describe("downloads", () => {
  it("picks the right file extension", () => {
    expect(extensionFor("video/mp4;codecs=avc1.42E01F,mp4a.40.2")).toBe("mp4");
    expect(extensionFor("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/webm")).toBe("weba");
  });

  it("names files by date, station and part", () => {
    expect(stationFilename("2026-11-09T10:00:00.000Z", 3, "txt")).toBe("PracticeMMI-2026-11-09-station-3.txt");
    expect(stationFilename("2026-11-09T10:00:00.000Z", 3, "mp4", 2)).toBe("PracticeMMI-2026-11-09-station-3-part-2.mp4");
  });

  it("includes the question in the transcript file", () => {
    expect(transcriptFileText(1, "Why?", "Because.")).toBe("Station 1\n\nQuestion:\nWhy?\n\nTranscript:\nBecause.\n");
  });
});
