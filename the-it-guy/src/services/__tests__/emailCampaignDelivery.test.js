import { beforeEach, expect, it, vi } from 'vitest'
import { createContentCheckHandler } from '../../../../supabase/functions/email-campaign-content-check/handler.ts'
import { createCampaignTestHandler } from '../../../../supabase/functions/email-campaign-test/handler.ts'
import { createWorkerHandler } from '../../../../supabase/functions/email-campaign-worker/handler.ts'
import { checkCampaignContent } from '../../../../supabase/functions/_shared/emailCampaignContentCheck.ts'

const org = '11111111-1111-4111-8111-111111111111'
const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const path = `organisations/${org}/${assetId}.png`
const base = 'https://project.supabase.co'
const image = `${base}/storage/v1/object/public/email-campaign-images/${path}`
let state, db, fetcher, createClient, env

function mockDb() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: vi.fn(async () => ({ data: state.permitted, error: null })),
    from(table) {
      let operation = 'select', values, options, filters = [], limit
      const execute = () => {
        if (table === 'email_campaign_assets' && state.assetError) return { data: null, error: new Error('Unavailable') }
        const rows = (state.tables[table] || []).filter((row) => filters.every((filter) => filter(row)))
        const selected = limit ? rows.slice(0, limit) : rows
        if (operation === 'update') {
          state.writes.push({ table, values: { ...values }, ids: selected.map((row) => row.id) })
          for (const row of selected) Object.assign(row, values)
        }
        if (operation === 'insert' || operation === 'upsert') {
          const row = { ...values, tracking_token: values.tracking_token || 'link-token' }
          ;(state.tables[table] ||= []).push(row)
          return { data: [row], error: null }
        }
        return options?.count ? { count: rows.length, data: null, error: null } : { data: selected, error: null }
      }
      const query = {
        select(_columns, opts) { options = opts; return query },
        update(next) { operation = 'update'; values = next; return query },
        insert(next) { operation = 'insert'; values = next; return query },
        upsert(next) { operation = 'upsert'; values = next; return query },
        eq(key, value) { filters.push((row) => row[key] === value); return query },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query },
        lte(key, value) { filters.push((row) => row[key] <= value); return query },
        gte(key, value) { filters.push((row) => row[key] >= value); return query },
        not(key, _operator, value) { filters.push((row) => row[key] != value); return query },
        order() { return query },
        limit(value) { limit = value; return query },
        async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] || null } },
        async single() { const result = execute(); return { ...result, data: result.data?.[0] || null } },
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject) },
      }
      return query
    },
  }
}

const request = (body, headers = {}) => new Request('https://functions.example.com', { method: 'POST', headers: { authorization: 'Bearer user-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const check = () => createContentCheckHandler({ createClient, env, fetcher })(request({ campaignId: 'campaign' }))
const test = (patch = {}) => createCampaignTestHandler({ createClient, env, fetcher })(request({ organisationId: org, senderIdentityId: 'sender', html: '<script>stale()</script>', contentJson: state.tables.email_campaigns[0].content_json, subject: 'News', ...patch }))
const worker = () => createWorkerHandler({ createClient, env, fetcher })(request({}, { 'x-arch9-email-worker-secret': 'worker-test-secret' }))
const providerCalls = () => fetcher.mock.calls.filter(([url]) => url === 'https://api.resend.com/emails')
beforeEach(() => {
  const identity = { id: 'sender', organisation_id: org, display_name: 'Agency', from_email: 'agent@example.com', verification_status: 'verified', sending_paused_at: null }
  state = { user: { id: 'user', email: 'agent@example.com' }, permitted: true, writes: [], tables: {
    email_campaigns: [{ id: 'campaign', organisation_id: org, subject: 'News', preview_text: 'A property update', content_json: { version: 1, mode: 'advanced', blocks: [], advancedHtml: `<html><body><p>Hello {{first_name}}</p><img src="${image}" alt="Hero"><a href="https://example.com/news?x=1&amp;y=2">View</a></body></html>` }, html: '<script>stale()</script>', status: 'sending', email_sender_identities: identity }],
    email_sender_identities: [identity],
    email_campaign_assets: [{ organisation_id: org, storage_path: path, mime_type: 'image/png', byte_size: 8 }],
    email_campaign_dispatch_jobs: [{ id: 'job', campaign_id: 'campaign', organisation_id: org, status: 'queued', run_at: '2020-01-01T00:00:00Z' }],
    email_sending_policies: [{ organisation_id: org, approved_at: '2020-01-01', paused_at: null, daily_recipient_limit: 500, max_recipients_per_worker_run: 50 }],
    email_campaign_recipients: [{ id: 'recipient', organisation_id: org, campaign_id: 'campaign', email: 'buyer@example.com', status: 'queued', recipient_snapshot: { first_name: 'Alex' }, tracking_token: 'recipient-token', send_attempts: 0 }],
    contact_marketing_preferences: [{ organisation_id: org, email: 'buyer@example.com', marketing_consent_status: 'opted_in', unsubscribe_token: 'personal-token' }],
  } }
  db = mockDb()
  createClient = vi.fn(() => db)
  env = (key) => ({ SUPABASE_URL: base, SUPABASE_ANON_KEY: 'anon-test-key', SUPABASE_SERVICE_ROLE_KEY: 'service-test-key', EMAIL_CAMPAIGN_WORKER_SECRET: 'worker-test-secret', RESEND_API_KEY: 'resend-test-key' })[key]
  fetcher = vi.fn(async (_url, options) => options.method === 'HEAD' ? new Response(null, { headers: { 'content-type': 'image/png', 'content-length': '8' } }) : Response.json({ id: 'message-id' }))
})

it('checks the actual saved document and owned public image without sending or writing', async () => {
  const response = await check()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ready: true, errors: [] })
  expect(fetcher).toHaveBeenCalledWith(image, expect.objectContaining({ method: 'HEAD', redirect: 'manual' }))
  expect(providerCalls()).toHaveLength(0)
  expect(state.writes).toEqual([])
  expect(createClient.mock.calls[0][2].global.headers.Authorization).toBe('Bearer user-token')
})

it('requires authentication and campaign send permission before checking images', async () => {
  state.user = null
  expect((await check()).status).toBe(401)
  state.user = { id: 'user' }
  state.permitted = false
  expect((await check()).status).toBe(403)
  expect(fetcher).not.toHaveBeenCalled()
})

it('rejects a different agency’s image even when the imported manifest claims it is owned', async () => {
  state.tables.email_campaigns[0].content_json.advancedHtml = `<img src="${image.replace(org, '22222222-2222-4222-8222-222222222222')}" alt="Hero">`
  state.tables.email_campaigns[0].content_json.importedEmail = { assets: [{ id: assetId, publicUrl: image }] }
  expect(await (await check()).json()).toMatchObject({ ready: false, errors: [expect.stringContaining('belonging to this agency')] })
  expect(fetcher).not.toHaveBeenCalled()
})

it('does not let encoded bucket names or transformed image URLs bypass the campaign library check', async () => {
  const foreign = image.replace(org, '22222222-2222-4222-8222-222222222222').replace('email-campaign-images', 'email%2Dcampaign%2Dimages')
  state.tables.email_campaigns[0].content_json.advancedHtml = `<img src="${foreign}" alt="Hero">`
  expect(await (await check()).json()).toMatchObject({ ready: false })
  state.tables.email_campaigns[0].content_json.advancedHtml = `<img src="${image.replace('/object/public/', '/render/image/public/')}?width=600" alt="Hero">`
  expect(await (await check()).json()).toMatchObject({ ready: false, errors: [expect.stringContaining('original campaign image link')] })
  expect(fetcher).not.toHaveBeenCalled()
})

it.each(['missing', 'registry', 'redirect', 'mime', 'size', 'network'])('fails closed for unconfirmed hosted images: %s', async (failure) => {
  if (failure === 'registry') state.assetError = true
  if (failure === 'missing') state.tables.email_campaign_assets = []
  if (failure === 'redirect') fetcher.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }))
  if (failure === 'mime') fetcher.mockResolvedValue(new Response(null, { headers: { 'content-type': 'text/html', 'content-length': '8' } }))
  if (failure === 'size') fetcher.mockResolvedValue(new Response(null, { headers: { 'content-type': 'image/png', 'content-length': '12' } }))
  if (failure === 'network') fetcher.mockRejectedValue(new Error('Timeout'))
  const report = await checkCampaignContent({ db, campaign: state.tables.email_campaigns[0], supabaseUrl: base, fetcher })
  expect(report.ready).toBe(false)
  expect(report.errors.length).toBeGreaterThan(0)
  expect(providerCalls()).toHaveLength(0)
})

it('does not fetch arbitrary external hosts and reports external-image retention separately', async () => {
  state.tables.email_campaigns[0].content_json.advancedHtml = '<img src="https://cdn.example.com/hero.png" alt="Hero">'
  const report = await (await check()).json()
  expect(report.ready).toBe(true)
  expect(report.warnings.join(' ')).toContain('have not been verified')
  expect(fetcher).not.toHaveBeenCalled()
})

it('rejects a direct test request with unsafe or unresolved content before calling the provider', async () => {
  for (const html of ['<img src="local.png">', '<img src="https://example.com/a.png" onerror=bad()>', '<!--[if mso]><script>bad()</script><![endif]-->']) {
    const response = await test({ contentJson: { version: 1, mode: 'advanced', blocks: [], advancedHtml: html }, html: '<p>Different harmless HTML</p>' })
    expect(response.status).toBe(400)
  }
  expect(providerCalls()).toHaveLength(0)
})

it('sends a validated test with real plain text and a footer inside the body', async () => {
  const response = await test()
  expect(response.status).toBe(200)
  const payload = JSON.parse(providerCalls()[0][1].body)
  expect(payload.subject).toBe('[TEST] News')
  expect(payload.html).not.toContain('stale()')
  expect(payload.html.indexOf('Test email from')).toBeLessThan(payload.html.indexOf('</body>'))
  expect(payload.text).toContain('Hello there')
  expect(state.writes).toEqual([])
})

it('stops paused test senders and preview contacts outside the agency', async () => {
  state.tables.email_sender_identities[0].sending_paused_at = '2026-10-09'
  expect((await test()).status).toBe(400)
  state.tables.email_sender_identities[0].sending_paused_at = null
  expect((await test({ previewRecipientId: 'another-agency-contact' })).status).toBe(400)
  expect(providerCalls()).toHaveLength(0)
})

it('blocks malformed queued content even when scheduling was called directly', async () => {
  state.tables.email_campaigns[0].content_json.advancedHtml = '<img src="local.png">'
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining('local images') })
  expect(state.tables.email_campaigns[0].status).toBe('failed')
  expect(state.tables.email_campaign_recipients[0].status).toBe('failed')
})

it('rechecks hosted image availability at dispatch time and preserves a partial delivery state', async () => {
  state.tables.email_campaign_recipients.push({ id: 'previous', campaign_id: 'campaign', organisation_id: org, status: 'sent' })
  fetcher.mockResolvedValue(new Response(null, { status: 404 }))
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
  expect(state.tables.email_campaign_recipients[0].status).toBe('failed')
})

it('preserves consent, claims, tracking, idempotency and the personal unsubscribe link on valid delivery', async () => {
  const response = await worker()
  expect(await response.json()).toMatchObject({ processed: 1 })
  expect(providerCalls()).toHaveLength(1)
  const [, options] = providerCalls()[0]
  const payload = JSON.parse(options.body)
  expect(options.headers['Idempotency-Key']).toBe('campaign:campaign:recipient:recipient')
  expect(payload.html).toContain('Hello Alex')
  expect(payload.html).toContain('email-campaign-track?l=link-token')
  expect(payload.html).toContain('email-unsubscribe?token=personal-token')
  expect(payload.html.indexOf('>Unsubscribe</a>')).toBeLessThan(payload.html.indexOf('</body>'))
  expect(payload.text).toContain('Hello Alex')
  expect(payload.text).toContain('personal-token')
  expect(state.tables.email_campaign_recipients[0].status).toBe('sent')
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('completed')
})

it('does not deliver after consent has been revoked', async () => {
  state.tables.contact_marketing_preferences[0].marketing_consent_status = 'opted_out'
  await worker()
  expect(state.tables.email_campaign_recipients[0].status).toBe('suppressed')
  expect(providerCalls()).toHaveLength(0)
})

it('does not deliver for an unapproved or paused sending policy', async () => {
  state.tables.email_sending_policies[0].approved_at = null
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0].last_error).toContain('not approved')
})

it('fails pending recipients when the verified sender is paused after scheduling', async () => {
  state.tables.email_sender_identities[0].sending_paused_at = '2026-10-09'
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaigns[0].status).toBe('failed')
  expect(state.tables.email_campaign_recipients[0].status).toBe('failed')
})

it('denies unauthenticated worker calls without touching the database', async () => {
  const response = await createWorkerHandler({ createClient, env, fetcher })(request({}))
  expect(response.status).toBe(401)
  expect(createClient).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})
