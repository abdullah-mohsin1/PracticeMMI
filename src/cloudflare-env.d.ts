declare global {
  interface CloudflareEnv {
    APP_ENV: string;
    HEALTH_CHECK_SECRET?: string;
  }
}

export {};
