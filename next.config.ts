import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingIncludes: { "/documents": ["./output/pdf/*.pdf"] },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
