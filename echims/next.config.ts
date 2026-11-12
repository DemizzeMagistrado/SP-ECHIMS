import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/offline-worker': ['./public/sw.js'] },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  // NIP-REV01: Vaccination has two tabs; the old section URLs keep working.
  async redirects() {
    return [
      { source: '/vaccination/defaulters', destination: '/vaccination/schedule?status=missed', permanent: true },
      { source: '/vaccination/sms', destination: '/vaccination/schedule', permanent: true },
      { source: '/vaccination/catalog', destination: '/settings/vaccine-catalog', permanent: true },
      { source: '/vaccination/batch-requests', destination: '/inventory/batch-requests', permanent: true },
    ]
  },
}

export default nextConfig