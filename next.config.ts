import type { NextConfig } from "next";

// A fully static site: `next build` writes plain files to out/. Pages must not
// use route handlers, server actions or per-request rendering.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
