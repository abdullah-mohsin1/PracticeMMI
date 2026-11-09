import { describe, expect, it } from "vitest";
import { parseFirebaseConfig } from "@/lib/firebase/config";

const valid = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo",
  NEXT_PUBLIC_FIREBASE_APP_ID: "app",
};

describe("parseFirebaseConfig", () => {
  it("maps the public values", () => {
    expect(parseFirebaseConfig(valid)).toEqual({
      apiKey: "key",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo",
      appId: "app",
    });
  });

  it("names a missing field", () => {
    expect(() => parseFirebaseConfig({ ...valid, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "" })).toThrow(
      /NEXT_PUBLIC_FIREBASE_PROJECT_ID/,
    );
  });
});
