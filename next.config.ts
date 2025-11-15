import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    POLY_BUILDER_KEY: process.env.POLY_BUILDER_KEY,
  },
};

export default nextConfig;
