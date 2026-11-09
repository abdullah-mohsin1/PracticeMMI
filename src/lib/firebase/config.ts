import type { FirebaseOptions } from "firebase/app";
import { z } from "zod";

const configSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
});

export function parseFirebaseConfig(source: unknown): FirebaseOptions {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid Firebase configuration: ${fields}`);
  }
  return {
    apiKey: result.data.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: result.data.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: result.data.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: result.data.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

// Next.js only inlines public variables that are named in full.
export const readFirebaseConfig = () =>
  parseFirebaseConfig({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
