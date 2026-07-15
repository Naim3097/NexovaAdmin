import type { NextConfig } from "next";

/**
 * NOTE: PWA is deferred. `@ducanh2912/next-pwa` is webpack-only;
 * Next.js 16 builds with Turbopack by default. We'll re-enable a PWA
 * via `@serwist/next` (Turbopack-compatible) in a follow-up.
 *
 * The `manifest.webmanifest` and PWA-friendly metadata are already in place,
 * so the app installs as a basic PWA without a service worker.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes: true,  // re-enable once nav arrays use typed Route helpers
  experimental: {
    serverActions: {
      // Onboarding form can include a logo + multiple photos. NFR cap is 50MB/file.
      // 50mb gives one large logo OR ~5x10MB photos in a single submit.
      bodySizeLimit: "50mb",
    },
    // Next 16 buffers request bodies through proxy.ts with a 10MB default —
    // larger uploads got truncated mid-stream ("Unexpected end of form")
    // before serverActions.bodySizeLimit was ever consulted. Match the 50mb cap.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
