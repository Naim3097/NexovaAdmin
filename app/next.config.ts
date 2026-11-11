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
  // The shared mock-up runs on the JSON dev store: ship the `seed-data`
  // snapshot with every route so it can be copied to /tmp on first use
  // (see src/lib/dev-store/root.ts). Harmless when the folder is absent.
  outputFileTracingIncludes: {
    "/": ["./seed-data/**/*"],
    "/*": ["./seed-data/**/*"],
    "/**": ["./seed-data/**/*"],
  },
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
