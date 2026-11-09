import type { NextConfig } from "next";

// GitHub Pages serves the repository under a sub-path, so the build sets NEXT_PUBLIC_BASE_PATH.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
