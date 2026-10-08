import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createECDH } from 'node:crypto'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import webPush from 'web-push'
import { createMobileWebPushResponse, createMobileWebPushOperatorResponse, readMobileWebPushBody, validatePushSubscription } from './mobileWebPushApi.js'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const keys = webPush.generateVAPIDKeys()
const env = { WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey, WEB_PUSH_VAPID_SUBJECT: 'mailto:alex@samlin.co.za' }
const curve = createECDH('prime256v1'); curve.generateKeys()
const subscription = { endpoint: 'https://web.push.apple.com/test-device', keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } }
const migration = await readFile(new URL('../../../supabase/migrations/20261008185046_mobile_web_push_subscriptions.sql', import.meta.url), 'utf8')

async function fixture() {
  const db = new PGlite()
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    insert into auth.users values ('${userA}'), ('${userB}');`)
  await db.exec(migration)
  const client = {
    auth: { getUser: async (token) => token === 'invalid' ? { error: true } : { data: { user: { id: token === 'b' ? userB : userA } } } },
    async rpc(name, params) {
      try {
        const args = Object.values(params)
        const result = await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args)
        return { data: result.rows[0].value }
      } catch (error) { return { error } }
    },
    from(name) {
      const filters = []; let remove = false
      const builder = {
        select() { return builder }, delete() { remove = true; return builder },
        order() { return builder }, limit() { return builder },
        eq(key, value) { filters.push([key, value]); return builder },
        async maybeSingle() { const result = await builder; return { data: result.data[0] || null, error: result.error } },
        async then(resolve, reject) {
          try {
            const result = await db.query(`${remove ? 'delete' : 'select id'} from public.${name} where ${filters.map(([key], i) => `${key} = $${i + 1}`).join(' and ')}`, filters.map(([, value]) => value))
            return resolve({ data: result.rows })
          } catch (error) { return reject ? reject(error) : resolve({ error }) }
        },
      }
      return builder
    },
  }
  const sends = []
  const call = (body, token = 'a', extras = {}) => createMobileWebPushResponse({ method: 'POST', headers: { authorization: `Bearer ${token}` },
    body: { ...(body.action === 'register' ? { publicKey: keys.publicKey } : {}), ...body }, env, client,
    sendNotification: async (sub, payload, options) => {
      // Exercise the real encryption and VAPID request generation without sending anything.
      const details = webPush.generateRequestDetails(sub, payload, options)
      assert.equal(details.headers['Content-Encoding'], 'aes128gcm')
      assert.ok(details.body.length > payload.length)
      sends.push({ sub, payload: JSON.parse(payload), options })
      return { statusCode: 201 }
    }, ...extras })
  return { db, client, sends, call }
}

test('only a verified owner can send a real encrypted test; account cooldown survives re-registration', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.call({ action: 'register', subscription }, 'invalid')).status, 401)
    assert.equal((await f.call({ action: 'register', subscription, userId: userB })).status, 400)
    const registered = await f.call({ action: 'register', subscription })
    assert.equal(registered.status, 200)
    const subscriptionId = registered.body.subscriptionId
    assert.equal((await f.call({ action: 'test', subscriptionId }, 'b')).status, 404)
    assert.equal((await f.call({ action: 'register', subscription }, 'b')).status, 503)
    assert.equal((await f.call({ action: 'status', subscription }, 'b')).body.subscriptionId, null)
    assert.equal((await f.call({ action: 'remove', subscriptionId }, 'b')).status, 200)
    assert.equal((await f.call({ action: 'status', subscription })).body.subscriptionId, subscriptionId)
    const outcomes = await Promise.all([f.call({ action: 'test', subscriptionId }), f.call({ action: 'test', subscriptionId })])
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 429])
    assert.equal(f.sends.length, 1)
    assert.equal(f.sends[0].payload.body, 'Your Arch9 notifications are working.')
    assert.equal(f.sends[0].payload.url, '/mobile/inbox')
    assert.equal(f.sends[0].options.TTL, 300)
    await f.call({ action: 'remove', subscriptionId })
    const again = await f.call({ action: 'register', subscription })
    assert.equal((await f.call({ action: 'test', subscriptionId: again.body.subscriptionId })).status, 429)
  } finally { await f.db.close() }
})

test('provider failures, expired endpoints, and rotated keys never report delivery', async () => {
  const f = await fixture()
  try {
    const registered = await f.call({ action: 'register', subscription })
    const subscriptionId = registered.body.subscriptionId
    const rotated = webPush.generateVAPIDKeys()
    assert.equal((await f.call({ action: 'register', subscription, publicKey: rotated.publicKey })).status, 409)
    assert.equal((await f.call({ action: 'test', subscriptionId }, 'a', { env: { ...env, WEB_PUSH_VAPID_PUBLIC_KEY: rotated.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: rotated.privateKey } })).status, 404)
    const failure = await f.call({ action: 'test', subscriptionId }, 'a', { sendNotification: async () => { throw new Error('private provider details') } })
    assert.equal(failure.status, 502)
    assert.ok(!JSON.stringify(failure).includes('private provider'))
    await f.db.exec('delete from public.mobile_web_push_test_limits')
    assert.equal((await f.call({ action: 'test', subscriptionId }, 'a', { sendNotification: async () => { throw Object.assign(new Error(), { statusCode: 410 }) } })).status, 410)
    assert.equal((await f.call({ action: 'status', subscription })).body.subscriptionId, null)
    assert.equal((await f.call({ action: 'register', subscription }, 'a', { env: {} })).status, 503)
  } finally { await f.db.close() }
})

test('browser roles cannot read encryption material, alter bindings, or bypass send limits', async () => {
  const f = await fixture()
  try {
    await f.call({ action: 'register', subscription })
    for (const role of ['anon', 'authenticated']) {
      await f.db.exec(`set role ${role}`)
      for (const sql of [
        'select * from public.mobile_web_push_subscriptions',
        'delete from public.mobile_web_push_test_limits',
        `select public.register_mobile_web_push('${userB}', repeat('a',64), '{}', 'key')`,
        `select public.claim_mobile_web_push_test('${userB}', '${userA}', 'key')`,
      ]) await assert.rejects(f.db.exec(sql), /permission denied/)
      await f.db.exec('reset role')
    }
    await f.db.exec('set role service_role')
    assert.equal((await f.db.query('select count(*)::int as n from public.mobile_web_push_subscriptions')).rows[0].n, 1)
  } finally { await f.db.close() }
})

test('rejects arbitrary network targets and malformed/oversized requests', async () => {
  for (const endpoint of ['https://127.0.0.1/internal', 'http://web.push.apple.com/test', 'https://web.push.apple.com.evil.test/x', 'https://web.push.apple.com:444/x', 'https://user:pass@fcm.googleapis.com/test']) {
    assert.throws(() => validatePushSubscription({ ...subscription, endpoint }))
  }
  assert.throws(() => validatePushSubscription({ ...subscription, keys: {} }))
  await assert.rejects(readMobileWebPushBody({ body: 'x'.repeat(8193) }), (e) => e.status === 413)
  await assert.rejects(readMobileWebPushBody(Readable.from([Buffer.alloc(8193)])), (e) => e.status === 413)
  await assert.rejects(readMobileWebPushBody({ body: '{' }), (e) => e.status === 400)
})

test('custom operator sends the exact message only to its configured account and shares the cooldown', async () => {
  const f = await fixture()
  const operatorEnv = { ...env, WEB_PUSH_OPERATOR_TOKEN: 'a'.repeat(43), WEB_PUSH_OPERATOR_USER_ID: userA }
  const body = { title: 'New Lead', message: 'You received a new enquiry' }
  const sent = []
  const call = (payload = body, token = operatorEnv.WEB_PUSH_OPERATOR_TOKEN, extras = {}) => createMobileWebPushOperatorResponse({
    headers: { authorization: `Bearer ${token}` }, body: payload, env: operatorEnv, client: f.client,
    sendNotification: async (sub, payload, options) => {
      const details = webPush.generateRequestDetails(sub, payload, options)
      assert.equal(details.headers['Content-Encoding'], 'aes128gcm')
      sent.push({ sub, payload: JSON.parse(payload) }); return { statusCode: 201 }
    }, ...extras,
  })
  try {
    await f.call({ action: 'register', subscription: { ...subscription, endpoint: 'https://web.push.apple.com/other-user' } }, 'b')
    assert.equal((await call(body, 'invalid')).status, 401)
    assert.equal((await call({ ...body, userId: userB })).status, 400)
    assert.equal((await call({ ...body, message: 'x'.repeat(241) })).status, 400)
    assert.equal((await call({ ...body, title: 'a\nspoof' })).status, 400)
    assert.equal((await call({ ...body, dryRun: 'yes' })).status, 400)
    assert.equal((await call()).status, 404)
    await f.call({ action: 'register', subscription })
    assert.deepEqual((await call({ ...body, dryRun: true })).body, { ready: true })
    assert.equal(sent.length, 0)
    assert.equal((await f.db.query('select count(*)::int n from public.mobile_web_push_test_limits')).rows[0].n, 0)
    assert.equal((await call()).body.accepted, true)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].sub.endpoint, subscription.endpoint)
    assert.deepEqual(sent[0].payload, { title: body.title, body: body.message, url: '/mobile/inbox' })
    assert.equal((await call()).status, 429)
    const registered = await f.call({ action: 'status', subscription })
    assert.equal((await f.call({ action: 'test', subscriptionId: registered.body.subscriptionId })).status, 429)
    assert.equal((await call(body, operatorEnv.WEB_PUSH_OPERATOR_TOKEN, { method: 'GET' })).status, 405)
  } finally { await f.db.close() }
})

test('custom operator fails closed on missing setup, expired devices and rejected delivery', async () => {
  const f = await fixture()
  const operatorEnv = { ...env, WEB_PUSH_OPERATOR_TOKEN: 'a'.repeat(43), WEB_PUSH_OPERATOR_USER_ID: userA }
  const call = (extras = {}) => createMobileWebPushOperatorResponse({ headers: { authorization: `Bearer ${operatorEnv.WEB_PUSH_OPERATOR_TOKEN}` },
    body: { title: 'New Lead', message: 'You received a new enquiry' }, env: operatorEnv, client: f.client,
    sendNotification: async () => { throw new Error('private details') }, ...extras })
  try {
    assert.equal((await call({ env: {} })).status, 503)
    const registered = await f.call({ action: 'register', subscription })
    const failure = await call()
    assert.equal(failure.status, 502)
    assert.ok(!JSON.stringify(failure).includes('private details'))
    await f.db.exec('delete from public.mobile_web_push_test_limits')
    assert.equal((await call({ sendNotification: async () => { throw Object.assign(new Error(), { statusCode: 410 }) } })).status, 410)
    assert.equal((await f.call({ action: 'status', subscription })).body.subscriptionId, null)
    assert.equal((await f.db.query('select count(*)::int n from public.mobile_web_push_test_limits')).rows[0].n, 1)
    assert.equal((await f.call({ action: 'test', subscriptionId: registered.body.subscriptionId })).status, 404)
  } finally { await f.db.close() }
})
