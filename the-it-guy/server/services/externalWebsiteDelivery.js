import { createHmac, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { externalWebsiteClient, tokenHash } from './externalWebsiteApi.js'

const blocked = new BlockList()
for (const [address, prefix] of [['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8], ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.168.0.0',16], ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',3]]) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [['2001::',32], ['2001:db8::',32], ['2002::',16], ['3fff::',20]]) blocked.addSubnet(address, prefix, 'ipv6')
export function publicAddress(address) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, 'ipv4')
  // Global IPv6 unicast only; disallow tunnelling and documentation ranges.
  return family === 6 && /^[23]/i.test(address) && !blocked.check(address, 'ipv6')
}
export function webhookSignature(secret, timestamp, rawBody) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`
}
export function verifyWebhook(secret, timestamp, rawBody, signature, now = Date.now()) {
  if (!/^\d{10}$/.test(String(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^sha256=[a-f0-9]{64}$/.test(String(signature))) return false
  return timingSafeEqual(Buffer.from(webhookSignature(secret, timestamp, rawBody)), Buffer.from(signature))
}

export async function deliverExternalWebhook(delivery, { resolveHost = lookup, request = httpsRequest, now = Date.now } = {}) {
  if (typeof delivery.secret !== 'string' || delivery.secret.length < 32) throw new Error('signing_secret_missing')
  const url = new URL(delivery.url)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || !url.hostname.includes('.')) throw new Error('unsafe_webhook_destination')
  const addresses = await resolveHost(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error('unsafe_webhook_destination')
  const address = addresses[0]
  const body = JSON.stringify(delivery.event)
  const timestamp = String(Math.floor(now() / 1000))
  return new Promise((resolve, reject) => {
    const outgoing = request(url, {
      method: 'POST',
      // Pin the vetted DNS response while retaining hostname TLS verification.
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Arch9-Timestamp': timestamp,
        'X-Arch9-Signature': webhookSignature(delivery.secret, timestamp, body), 'X-Arch9-Event-Id': delivery.event.id },
    }, (response) => { const status = response.statusCode; response.destroy(); resolve(status) })
    outgoing.setTimeout(10000, () => outgoing.destroy(new Error('delivery_timeout')))
    outgoing.on('error', () => reject(new Error('delivery_network_error')))
    outgoing.end(body)
  })
}

const rpc = async (client, name, params = {}) => { const { data, error } = await client.rpc(name, params); if (error) throw error; return data }
export async function runExternalWebsiteWorker({ client = externalWebsiteClient(), deliver = deliverExternalWebhook, dispatchNotification, env = process.env } = {}) {
  const deliveries = await rpc(client, 'external_website_claim_deliveries', { p_limit: 20 })
  const outcomes = []
  // Small concurrent batches bound execution time and preserve database claims.
  for (let start = 0; start < deliveries.length; start += 4) {
    await Promise.all(deliveries.slice(start, start + 4).map(async (delivery) => {
      let status = 0
      let error = null
      try {
        if (!await rpc(client, 'external_website_delivery_active', { p_id: delivery.deliveryId, p_claim: delivery.claimId })) { outcomes.push('cancelled'); return }
        status = await deliver(delivery)
        if (status < 200 || status > 299) error = `http_${status}`
      } catch (failure) { error = ['unsafe_webhook_destination', 'signing_secret_missing', 'delivery_timeout'].includes(failure.message) ? failure.message : 'delivery_network_error' }
      await rpc(client, 'external_website_complete_delivery', { p_id: delivery.deliveryId, p_claim: delivery.claimId, p_status: status, p_error: error })
      outcomes.push(error ? 'failed_attempt' : 'delivered')
    }))
  }
  const notifications = await rpc(client, 'external_website_pending_notifications')
  const dispatch = dispatchNotification || (async (eventId) => {
    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/website-lead-dispatcher`, { method: 'POST',
      headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }), signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('notification_dispatch_pending')
  })
  let notificationsAttempted = 0
  for (let start = 0; start < notifications.length; start += 4) {
    await Promise.all(notifications.slice(start, start + 4).map(async (id) => { try { await dispatch(id); notificationsAttempted += 1 } catch { /* Existing notification outbox owns retry and idempotency. */ } }))
  }
  return { deliveriesAttempted: outcomes.length, delivered: outcomes.filter((value) => value === 'delivered').length, notificationsAttempted }
}

export async function createExternalWebsiteWorkerResponse({ method, headers = {}, env = process.env, runWorker = runExternalWebsiteWorker } = {}) {
  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } }
  if (!env.CRON_SECRET || !timingSafeEqual(Buffer.from(tokenHash(String(headers.authorization || ''))), Buffer.from(tokenHash(`Bearer ${env.CRON_SECRET}`)))) return { status: 401, body: { error: 'unauthorised' } }
  try { return { status: 200, body: await runWorker({ env }) } } catch { return { status: 503, body: { error: 'worker_unavailable' } } }
}
