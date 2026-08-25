import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel/webpack: firebase-admin يُحمَّل من node_modules على الخادم.
  serverExternalPackages: ['firebase-admin'],
  allowedDevOrigins: ["172.20.10.3"],
};

export default nextConfig;
