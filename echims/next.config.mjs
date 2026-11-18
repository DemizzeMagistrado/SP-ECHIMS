import path from 'node:path'
import {fileURLToPath} from 'node:url'
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {root: path.dirname(fileURLToPath(import.meta.url))},
  outputFileTracingIncludes: {'/offline-worker':['./public/sw.js']},
  typescript: {ignoreBuildErrors:false},
  images: {unoptimized:true},
}
export default nextConfig
