import { describe, expect, it } from "vitest";
import { buildPhases, formatCountdown, locatePhase, makeConfig, totalSeconds, validateConfig } from "@/lib/practice/timeline";

describe("timeline", () => {
  it("runs a full mock as 8 stations with one 2-minute break after station 4", () => {
    const config = makeConfig("mock", 3, 120, 360);
    const phases = buildPhases(config);
    expect(config.stationCount).toBe(8);
    expect(phases).toHaveLength(17);
    expect(phases.filter((phase) => phase.kind === "break")).toEqual([{ kind: "break", afterStation: 4, startMs: 1_920_000, endMs: 2_040_000 }]);
    expect(phases[9]).toMatchObject({ kind: "prep", station: 5 });
    expect(totalSeconds(config)).toBe(8 * 480 + 120);
  });

  it("has no break in custom mode and leaves out zero-length preparation", () => {
    const phases = buildPhases(makeConfig("custom", 2, 0, 30));
    expect(phases.map((phase) => phase.kind)).toEqual(["speak", "speak"]);
  });

  it("derives the phase and remaining time from elapsed time alone", () => {
    const phases = buildPhases(makeConfig("custom", 1, 120, 360));
    expect(locatePhase(phases, 0)).toMatchObject({ index: 0, remainingMs: 120_000 });
    expect(locatePhase(phases, 119_999)).toMatchObject({ index: 0, remainingMs: 1 });
    expect(locatePhase(phases, 120_000)).toMatchObject({ index: 1, remainingMs: 360_000 });
    expect(locatePhase(phases, 480_000)).toBeNull();
  });

  it("rounds the countdown up", () => {
    expect(formatCountdown(360_000)).toBe("6:00");
    expect(formatCountdown(359_001)).toBe("6:00");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("rejects settings outside the limits", () => {
    expect(validateConfig(makeConfig("custom", 0, -1, 5))).toEqual({
      stationCount: expect.any(String),
      prepSeconds: expect.any(String),
      speakSeconds: expect.any(String),
    });
    expect(validateConfig(makeConfig("custom", 12, 0, 10))).toEqual({});
  });
});
