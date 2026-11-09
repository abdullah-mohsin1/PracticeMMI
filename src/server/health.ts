import type { AppEnv } from "./env";

export type HealthReport = {
  status: "ok";
  environment: AppEnv["APP_ENV"];
  time: string;
  secretConfigured?: boolean;
};

export function buildHealthReport(env: AppEnv, now: Date): HealthReport {
  const report: HealthReport = {
    status: "ok",
    environment: env.APP_ENV,
    time: now.toISOString(),
  };
  if (env.APP_ENV !== "production") {
    report.secretConfigured = env.HEALTH_CHECK_SECRET !== undefined;
  }
  return report;
}
