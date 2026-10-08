import { createHash, createECDH, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import webPush from 'web-push'

const table = 'mobile_web_push_subscriptions'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function reply(status, body) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body }
}
function fail(status, message) { throw Object.assign(new Error(message), { status }) }

export function validatePushSubscription(value) {
  let url
  try { url = new URL(value?.endpoint) } catch { fail(400, 'Invalid notification subscription.') }
  const apple = url.hostname === 'web.push.apple.com' || url.hostname.endsWith('.push.apple.com')
  const google = url.hostname === 'fcm.googleapis.com'
  const mozilla = url.hostname === 'updates.push.services.mozilla.com'
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      !(apple || google || mozilla) || value.endpoint.length > 2048) {
    fail(400, 'Unsupported notification provider.')
  }
  for (const [key, length] of [['p256dh', 65], ['auth', 16]]) {
    const input = value?.keys?.[key]
    if (typeof input !== 'string' || !/^[A-Za-z0-9_-]+$/.test(input) || Buffer.from(input, 'base64url').length !== length) {
      fail(400, 'Invalid notification subscription keys.')
    }
  }
  if (Buffer.from(value.keys.p256dh, 'base64url')[0] !== 4) fail(400, 'Invalid notification subscription keys.')
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } }
}

function configuration(env) {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY
  const subject = env.WEB_PUSH_VAPID_SUBJECT
  try {
    const curve = createECDH('prime256v1')
    curve.setPrivateKey(Buffer.from(privateKey || '', 'base64url'))
    if (curve.getPublicKey().toString('base64url') !== publicKey) throw new Error()
    if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject || '')) throw new Error()
  } catch { fail(503, 'Push notifications are not available yet. Please try again after setup is complete.') }
  return { publicKey, privateKey, subject }
}

export async function createMobileWebPushResponse({ method = 'GET', headers = {}, body = {}, env = process.env,
  client, sendNotification = webPush.sendNotification.bind(webPush) } = {}) {
  if (!['GET', 'POST'].includes(method)) return reply(405, { message: 'Use GET or POST for notifications.' })
  try {
    const token = String(headers.authorization || headers.Authorization || '').match(/^Bearer (.+)$/i)?.[1]
    if (!token) fail(401, 'Sign in before enabling notifications.')
    if (!client) {
      const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
      if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) fail(503, 'Notifications are temporarily unavailable.')
      client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    }
    const auth = await client.auth.getUser(token)
    const user = auth?.data?.user
    if (auth.error || !user?.id || user.is_anonymous) fail(401, 'Sign in before enabling notifications.')
    const vapid = configuration(env)
    if (method === 'GET') return reply(200, { publicKey: vapid.publicKey })
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid notification request.')
    // Do not accept recipients, account IDs, arbitrary messages, or destinations.
    if (Object.keys(body).some((key) => !['action', 'subscription', 'subscriptionId', 'publicKey'].includes(key))) fail(400, 'Invalid notification request.')
    if (body.action === 'register' || body.action === 'status') {
      if (body.action === 'register' && body.publicKey !== vapid.publicKey) fail(409, 'Notification setup changed. Enable notifications again.')
      const subscription = validatePushSubscription(body.subscription)
      const hash = createHash('sha256').update(subscription.endpoint).digest('hex')
      if (body.action === 'status') {
        const { data, error } = await client.from(table).select('id').eq('user_id', user.id)
          .eq('endpoint_hash', hash).eq('vapid_public_key', vapid.publicKey).maybeSingle()
        if (error) fail(503, 'Notification registration could not be checked.')
        return reply(200, { subscriptionId: data?.id || null })
      }
      const { data, error } = await client.rpc('register_mobile_web_push', {
        p_user_id: user.id, p_endpoint_hash: hash, p_subscription: subscription, p_vapid_public_key: vapid.publicKey,
      })
      if (error || !data) fail(503, 'Notifications could not be enabled. Please try again.')
      return reply(200, { subscriptionId: data })
    }
    if (!['test', 'remove'].includes(body.action) || !uuid.test(body.subscriptionId || '')) fail(400, 'Invalid notification request.')
    if (body.action === 'remove') {
      const { error } = await client.from(table).delete().eq('id', body.subscriptionId).eq('user_id', user.id)
      if (error) fail(503, 'Notifications could not be disabled. Please try again.')
      return reply(200, { removed: true })
    }
    const { data, error } = await client.rpc('claim_mobile_web_push_test', {
      p_user_id: user.id, p_subscription_id: body.subscriptionId, p_vapid_public_key: vapid.publicKey,
    })
    if (error) fail(503, 'The test could not be prepared. Please try again.')
    if (data?.status === 'rate_limited') return { ...reply(429, { message: 'Wait 30 seconds before sending another test.' }), headers: { ...reply(429).headers, 'Retry-After': '30' } }
    if (data?.status !== 'claimed') fail(404, 'Enable notifications on this device before sending a test.')
    const subscription = validatePushSubscription(data.subscription)
    try {
      const result = await sendNotification(subscription, JSON.stringify({
        title: 'Arch9 test notification', body: 'Your Arch9 notifications are working.', url: '/mobile/inbox',
      }), { vapidDetails: vapid, TTL: 300, urgency: 'high', timeout: 10000 })
      if (result?.statusCode < 200 || result?.statusCode >= 300 || !result?.statusCode) throw new Error()
    } catch (error) {
      if ([404, 410].includes(error?.statusCode)) {
        await client.from(table).delete().eq('id', body.subscriptionId).eq('user_id', user.id)
        fail(410, 'This device registration has expired. Enable notifications again.')
      }
      fail(502, 'The notification provider did not accept the test. Please try again.')
    }
    return reply(200, { accepted: true, message: 'Test sent to this device. Check your notifications or lock screen.' })
  } catch (error) {
    return reply(error.status || 500, { message: error.status ? error.message : 'Notifications are temporarily unavailable.' })
  }
}

export async function readMobileWebPushBody(request) {
  if (request.body !== undefined) {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    if (Buffer.byteLength(raw || '') > 8192) fail(413, 'Notification request is too large.')
    try { return JSON.parse(raw) } catch { fail(400, 'Invalid notification request.') }
  }
  const chunks = []; let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8192) fail(413, 'Notification request is too large.')
    chunks.push(chunk)
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} }
  catch { fail(400, 'Invalid notification request.') }
}

// The operator credential can send only to this explicitly configured account.
// Keep it in server secret storage; browser sessions never receive this token.
export async function createMobileWebPushOperatorResponse({ method = 'POST', headers = {}, body = {}, env = process.env,
  client, sendNotification = webPush.sendNotification.bind(webPush) } = {}) {
  if (method !== 'POST') return reply(405, { message: 'Use POST for notifications.' })
  try {
    const expected = env.WEB_PUSH_OPERATOR_TOKEN
    const userId = env.WEB_PUSH_OPERATOR_USER_ID
    if (!expected || expected.length < 32 || !uuid.test(userId || '')) fail(503, 'Custom notifications are not configured.')
    const supplied = String(headers.authorization || headers.Authorization || '').match(/^Bearer (.+)$/i)?.[1] || ''
    const digest = (value) => createHash('sha256').update(value).digest()
    if (!timingSafeEqual(digest(supplied), digest(expected))) fail(401, 'Notification operator authentication required.')
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['title', 'message', 'dryRun'].includes(key)) ||
      (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')) fail(400, 'Invalid notification request.')
    for (const [key, maximum] of [['title', 80], ['message', 240]]) {
      if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > maximum ||
        [...body[key]].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) fail(400, 'Provide a title up to 80 characters and a message up to 240 characters.')
    }
    const vapid = configuration(env)
    if (!client) {
      const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
      if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) fail(503, 'Notifications are temporarily unavailable.')
      client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    }
    const registered = await client.from(table).select('id').eq('user_id', userId)
      .eq('vapid_public_key', vapid.publicKey).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (registered.error) fail(503, 'Notification registration could not be checked.')
    if (!registered.data?.id) fail(404, 'Enable notifications on the receiving device first.')
    if (body.dryRun === true) return reply(200, { ready: true })
    const subscriptionId = registered.data.id
    const { data, error } = await client.rpc('claim_mobile_web_push_test', {
      p_user_id: userId, p_subscription_id: subscriptionId, p_vapid_public_key: vapid.publicKey,
    })
    if (error) fail(503, 'The notification could not be prepared.')
    if (data?.status === 'rate_limited') return { ...reply(429, { message: 'Wait 30 seconds before sending another notification.' }), headers: { ...reply(429).headers, 'Retry-After': '30' } }
    if (data?.status !== 'claimed') fail(404, 'Enable notifications on the receiving device first.')
    const subscription = validatePushSubscription(data.subscription)
    try {
      const result = await sendNotification(subscription, JSON.stringify({ title: body.title, body: body.message, url: '/mobile/inbox' }),
        { vapidDetails: vapid, TTL: 300, urgency: 'high', timeout: 10000 })
      if (!result?.statusCode || result.statusCode < 200 || result.statusCode >= 300) throw new Error()
    } catch (error) {
      if ([404, 410].includes(error?.statusCode)) {
        await client.from(table).delete().eq('id', subscriptionId).eq('user_id', userId)
        fail(410, 'This device registration has expired. Enable notifications again.')
      }
      fail(502, 'The notification provider did not accept the notification. Delivery may be uncertain; do not automatically retry.')
    }
    return reply(200, { accepted: true, message: 'The notification provider accepted the message.' })
  } catch (error) {
    return reply(error.status || 500, { message: error.status ? error.message : 'Notifications are temporarily unavailable.' })
  }
}
