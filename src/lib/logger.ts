type LogLevel = "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue>;

const SENSITIVE_KEY = /transcript|answer|audio|token|password|secret|authorization|cookie/i;

export function formatLogEntry(level: LogLevel, event: string, fields: LogFields, now: Date): string {
  const safeFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : value]),
  );
  return JSON.stringify({ ...safeFields, level, event, time: now.toISOString() });
}

export const logger = {
  info: (event: string, fields: LogFields = {}) => console.log(formatLogEntry("info", event, fields, new Date())),
  warn: (event: string, fields: LogFields = {}) => console.warn(formatLogEntry("warn", event, fields, new Date())),
  error: (event: string, fields: LogFields = {}) => console.error(formatLogEntry("error", event, fields, new Date())),
};
