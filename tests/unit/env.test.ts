import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    expect(parseEnv({ APP_ENV: "staging", HEALTH_CHECK_SECRET: "value" })).toEqual({
      APP_ENV: "staging",
      HEALTH_CHECK_SECRET: "value",
    });
  });

  it("allows the optional secret to be missing", () => {
    expect(parseEnv({ APP_ENV: "local" })).toEqual({ APP_ENV: "local" });
  });

  it("names the bad field without including its value", () => {
    expect(() => parseEnv({ APP_ENV: "do-not-print-me" })).toThrow(/APP_ENV/);
    expect(() => parseEnv({ APP_ENV: "do-not-print-me" })).not.toThrow(/do-not-print-me/);
  });

  it("rejects an empty secret", () => {
    expect(() => parseEnv({ APP_ENV: "local", HEALTH_CHECK_SECRET: "" })).toThrow(/HEALTH_CHECK_SECRET/);
  });
});
