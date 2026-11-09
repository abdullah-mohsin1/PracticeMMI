import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@/server/health";

const now = new Date("2026-11-08T12:00:00.000Z");

describe("buildHealthReport", () => {
  it("reports whether the secret exists, never its value", () => {
    const report = buildHealthReport({ APP_ENV: "staging", HEALTH_CHECK_SECRET: "hidden-value" }, now);
    expect(report).toEqual({
      status: "ok",
      environment: "staging",
      time: "2026-11-08T12:00:00.000Z",
      secretConfigured: true,
    });
    expect(JSON.stringify(report)).not.toContain("hidden-value");
  });

  it("reports a missing secret", () => {
    expect(buildHealthReport({ APP_ENV: "local" }, now).secretConfigured).toBe(false);
  });

  it("omits secret status in production", () => {
    const report = buildHealthReport({ APP_ENV: "production", HEALTH_CHECK_SECRET: "x" }, now);
    expect(report).not.toHaveProperty("secretConfigured");
  });
});
