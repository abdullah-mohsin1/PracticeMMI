import { describe, expect, it } from "vitest";
import { formatLogEntry } from "@/lib/logger";

const now = new Date("2026-11-08T12:00:00.000Z");

describe("formatLogEntry", () => {
  it("writes structured JSON", () => {
    expect(JSON.parse(formatLogEntry("info", "job_started", { jobId: "abc" }, now))).toEqual({
      jobId: "abc",
      level: "info",
      event: "job_started",
      time: "2026-11-08T12:00:00.000Z",
    });
  });

  it.each(["transcript", "studentAnswer", "audioUrl", "accessToken", "password", "Authorization", "cookie"])(
    "redacts %s",
    (key) => {
      const line = formatLogEntry("info", "event", { [key]: "private-content" }, now);
      expect(line).not.toContain("private-content");
    },
  );

  it("does not let fields overwrite the level or event", () => {
    const entry = JSON.parse(formatLogEntry("error", "real", { level: "info", event: "fake" }, now));
    expect(entry).toMatchObject({ level: "error", event: "real" });
  });
});
