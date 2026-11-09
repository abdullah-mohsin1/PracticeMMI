import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// cacheComponents and partialPrefetching stay off: see D-006 in DECISIONS.md.
const nextConfig: NextConfig = {};

export default nextConfig;

initOpenNextCloudflareForDev();
