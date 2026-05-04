import type { NextConfig } from "next";

// Allow additional origins for the Next.js dev server's HMR websocket.
// Set ALLOWED_DEV_ORIGINS in .env.local as a comma-separated list of hostnames,
// e.g. ALLOWED_DEV_ORIGINS=abc123.ngrok-free.app
const extraOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((h) => h.trim()).filter(Boolean)
  : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: extraOrigins,
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
