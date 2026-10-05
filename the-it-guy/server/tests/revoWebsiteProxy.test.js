import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRevoWebsiteProxy } from '../../docs/examples/revo-website-proxy.mjs'
import { createRevoWebsiteClient } from '../../src/modules/revo/website/revoWebsiteClient.js'
import { createExternalWebsiteDatabase, databaseClient, EXTERNAL_FIXTURE as f } from './fixtures/externalWebsiteDatabase.js'
import { createExternalWebsiteResponse } from '../services/externalWebsiteApi.js'

const base = { arch9BaseUrl: 'https://arch9.example.test', websiteOrigin: 'https://revo.example.test', credential: 'fixture-server-only' }
const lead = { name: 'Example Buyer', email: 'buyer@example.test', listingId: f.sale, sourcePageUrl: 'https://revo.example.test/properties', idempotencyKey: 'revo-website-submission-0001', consent: { privacyAccepted: true, marketingConsent: false, wording: 'Please respond to my property enquiry.', wordingVersion: 'revo-property-enquiry-v1' } }
const request = (body = lead, origin = base.websiteOrigin) => new Request(`${base.websiteOrigin}/api/arch9/leads`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('browser client uses only the website proxy and never sends a private Arch9 credential', async () => {
  assert.throws(() => createRevoWebsiteClient({ basePath: 'https://arch9.example.test/api' }), /same-origin/)
  assert.throws(() => createRevoWebsiteClient({ basePath: '//other.example.test/api' }), /same-origin/)
  const calls = []
  const browser = createRevoWebsiteClient({ fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ data: [], pagination: { total: 0 } })) } })
  await browser.listings({ location: 'Cape Town', transactionType: '', limit: 9 })
  assert.equal(calls[0].url, '/api/arch9/listings?location=Cape+Town&limit=9')
  assert.equal(calls[0].options.headers.Authorization, undefined)
  assert.equal(calls[0].options.cache, 'no-store')
})

test('server proxy rejects missing visitor protection, foreign source pages, extra endpoints and oversized bodies', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return new Response('{}') }
  const closed = createRevoWebsiteProxy({ ...base, fetchImpl })
  assert.equal((await closed(request())).status, 503)
  const proxy = createRevoWebsiteProxy({ ...base, fetchImpl, approveEnquiry: async () => true })
  assert.equal((await proxy(request(lead, 'https://foreign.example.test'))).status, 403)
  assert.equal((await proxy(request({ ...lead, sourcePageUrl: 'https://foreign.example.test/property' }))).status, 400)
  assert.equal((await proxy(request({ ...lead, message: 'x'.repeat(20000) }))).status, 413)
  assert.equal((await proxy(new Request(`${base.websiteOrigin}/api/arch9/changes`))).status, 404)
  const blocked = createRevoWebsiteProxy({ ...base, fetchImpl, approveEnquiry: async () => new Response('{}', { status: 429 }) })
  assert.equal((await blocked(request())).status, 429)
  assert.equal(calls, 0)
  assert.throws(() => createRevoWebsiteProxy({ ...base, arch9BaseUrl: 'http://arch9.example.test' }), /HTTPS/)
})

test('browser → Revo server proxy → actual scoped Arch9 API → CRM; withdrawal and revocation remain enforced', async () => {
  const db = await createExternalWebsiteDatabase()
  try {
    const client = databaseClient(db)
    const connection = (await client.rpc('external_website_manage', { p_organisation_id: f.revo, p_action: 'create', p_connection_id: null, p_config: { name: 'Revo website local acceptance', website_url: base.websiteOrigin, mode: 'listings_and_leads', scope: 'branches', branch_ids: [f.branch], fallback_user_id: f.principal, enabled: true } })).data
    assert.ok(connection?.credential)
    let upstreamCalls = 0
    const proxy = createRevoWebsiteProxy({ ...base, credential: connection.credential, approveEnquiry: async () => true, fetchImpl: async (url, options) => {
      upstreamCalls++
      assert.equal(options.redirect, 'error')
      assert.equal(new URL(url).origin, base.arch9BaseUrl)
      const result = await createExternalWebsiteResponse({ method: options.method, url: String(url), headers: { authorization: options.headers.Authorization }, body: options.body ? JSON.parse(options.body) : {}, client })
      return new Response(JSON.stringify(result.body), { status: result.status })
    } })
    const browser = createRevoWebsiteClient({ fetchImpl: (path, options) => proxy(new Request(`${base.websiteOrigin}${path}`, { ...options, headers: { ...options.headers, Origin: base.websiteOrigin } })) })
    assert.equal((await browser.listings({ location: 'Sea Point' })).pagination.total, 2)
    assert.equal((await browser.property(f.sale)).agent, null)
    const result = await browser.enquiry(lead)
    assert.equal(result.accepted, true)
    assert.equal((await browser.enquiry(lead)).leadId, result.leadId)
    const records = await db.query('select * from leads where lead_id=$1', [result.leadId])
    assert.equal(records.rows[0].assigned_agent_id, f.agent)
    await db.query("update private_listings set listing_status='withdrawn' where id=$1", [f.sale])
    assert.equal(await browser.property(f.sale), null)
    await client.rpc('external_website_manage', { p_organisation_id: f.revo, p_action: 'revoke', p_connection_id: connection.connection.id, p_config: {} })
    await assert.rejects(browser.listings(), (error) => [401,403].includes(error.status))
    assert.ok(upstreamCalls >= 6)
  } finally { await db.close() }
})
