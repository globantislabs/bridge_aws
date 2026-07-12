import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Critical for Vercel + Prisma: keep @prisma/client (and its binary engine)
  // as a server-side external package instead of bundling it into the
  // serverless function. Without this, Vercel deploys fail with
  // "Database not initialized" because the engine binary is missing.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
