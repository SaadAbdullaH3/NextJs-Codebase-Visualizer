import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude the CLI scanner source from Next.js compilation
  typescript: {
    // We type-check the CLI separately via tsconfig.cli.json
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
