import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const worker = await readFile(path.join(process.cwd(), 'public', 'sw.js'), 'utf8')
    if (!worker.includes('const assets = [') || worker.includes('self.__WB_MANIFEST')) {
      throw new Error('Offline worker has not been generated.')
    }
    return new Response(worker, { headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    console.error('Offline worker unavailable:', error)
    return new Response('Offline worker unavailable. Rebuild the deployment.', {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
