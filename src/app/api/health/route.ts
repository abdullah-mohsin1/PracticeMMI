import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { parseEnv } from "@/server/env";
import { buildHealthReport } from "@/server/health";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return NextResponse.json(buildHealthReport(parseEnv(env), new Date()), { headers });
  } catch (error) {
    logger.error("health_check_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ status: "error" }, { status: 500, headers });
  }
}
