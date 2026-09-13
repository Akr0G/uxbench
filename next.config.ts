import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["lighthouse", "playwright", "axe-core"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default config;
