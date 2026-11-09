import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "staging", "production"]),
  HEALTH_CHECK_SECRET: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: unknown): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Report field names only, so a bad value can never reach the logs.
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return result.data;
}
