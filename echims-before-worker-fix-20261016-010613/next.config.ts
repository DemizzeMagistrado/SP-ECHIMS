import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/offline-worker': ['./public/sw.js'] },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
}

export default nextConfig