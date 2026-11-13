/** @type {import('next').NextConfig} */
// The only Next.js config (next.config.ts was removed: Next.js loaded this file, so settings that
// lived only in the .ts file were silently ignored).
const nextConfig = {
  // The /offline-worker route reads public/sw.js at runtime: bundle it with the route.
  // scripts/prepare-offline.mjs creates a placeholder before `next build` (so a clean checkout has
  // something to trace) and scripts/build-offline.mjs then writes the real worker and checks it.
  outputFileTracingIncludes: { '/offline-worker': ['./public/sw.js'] },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // NIP-REV01: Vaccination has two tabs; the old section URLs keep working.
  async redirects() {
    return [
      { source: '/vaccination/defaulters', destination: '/vaccination/schedule?status=missed', permanent: true },
      { source: '/vaccination/sms', destination: '/vaccination/schedule', permanent: true },
      { source: '/vaccination/batch-requests', destination: '/inventory/batch-requests', permanent: true },
      // Vaccines tab (NIP-REV01). Not permanent: these moved twice, so browsers must not cache them.
      { source: '/vaccination/catalog', destination: '/vaccination/vaccines', permanent: false },
      { source: '/settings/vaccine-catalog', destination: '/vaccination/vaccines', permanent: false },
      // Child Profiling has one map (the Map tab); the old duplicate page is gone.
      { source: '/children/map', destination: '/geospatial', permanent: false },
    ]
  },
}

export default nextConfig
