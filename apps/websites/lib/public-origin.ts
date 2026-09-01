import { normalizeHostname } from '@/lib/site-repository'

export function publicOrigin(host: string | null | undefined): string | null {
  const hostname = normalizeHostname(host)
  if (!hostname || !/^(?:localhost|(?:[a-z0-9-]+\.)+[a-z0-9-]+)$/.test(hostname)) return null
  const protocol = hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : 'https'
  return `${protocol}://${hostname}`
}
