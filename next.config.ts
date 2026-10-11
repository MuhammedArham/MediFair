import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: { "/documents": ["./output/pdf/*.pdf"] },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
