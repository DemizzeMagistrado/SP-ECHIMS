import { createHmac, timingSafeEqual } from 'node:crypto'

// Standard Webhooks signed bytes: event ID + '.' + timestamp + '.' + raw body.
export function verifyGuardianHook(body: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get('webhook-id') ?? ''
  const timestamp = headers.get('webhook-timestamp') ?? ''
  const signatures = headers.get('webhook-signature') ?? ''
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error('Invalid signature')
  const encoded = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid hook configuration')
  const key = Buffer.from(encoded, 'base64')
  if (key.length < 32) throw new Error('Invalid hook configuration')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  const valid = signatures.split(/\s+/).some(part => {
    const [version, signature] = part.split(',')
    if (version !== 'v1' || !signature) return false
    const actual = Buffer.from(signature, 'base64')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
  if (!valid) throw new Error('Invalid signature')
  return { id, payloadHash: createHmac('sha256', key).update('payload:' + body).digest('hex'), hashPhone: (phone: string) => createHmac('sha256', key).update('phone:' + phone).digest('hex') }
}
