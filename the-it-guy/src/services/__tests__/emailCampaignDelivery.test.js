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
let testSequence = 0
const testReceipts = new Map()

// Worker API fixture; transactional and permission behaviour is additionally
// exercised against the actual SQL in email-campaign-delivery-reliability.test.mjs.
async function deliveryRpc(name, args) {
  if (name === state.rpcError) return {data:null,error:Error('Fixture RPC unavailable')}
  if (name === 'email_campaign_test_claim') {
    const key = `${args.p_organisation_id}:${args.p_actor_id}:${args.p_key}`
    const prior = testReceipts.get(key)
    if (prior) {
      if(prior.hash===args.p_hash && prior.status==='rejected') {prior.status='pending';return {data:{action:'send',id:key},error:null}}
      return {data:{action:prior.hash!==args.p_hash?'conflict':prior.status,id:key,providerMessageId:prior.providerMessageId},error:null}
    }
    testReceipts.set(key,{status:'pending',hash:args.p_hash})
    return {data:{action:'send',id:key},error:null}
  }
  if (name === 'email_campaign_test_complete') {
    const prior=testReceipts.get(args.p_id)
    if (!prior) return {data:false,error:null}
    Object.assign(prior,{status:args.p_status,providerMessageId:args.p_provider_message_id})
    return {data:true,error:null}
  }
  if (name === state.rpcError) return { data: null, error: new Error('Fixture RPC unavailable') }
  if (name === 'email_campaign_acquire_send_slot') return { data: { action: state.slotAction || 'send', retry_after_ms: 60000 }, error: null }
  if (name === 'email_campaign_provider_backoff') return { data: null, error: null }
  const rows = state.tables.email_campaign_recipients
  const jobs = state.tables.email_campaign_dispatch_jobs
  if (name === 'email_campaign_stop_dispatch') {
    const job = jobs.find(j => j.id === args.p_job_id)
    if (job.lease_token !== args.p_lease_token) return { data: false, error: null }
    for (const r of rows.filter(r => r.campaign_id === job.campaign_id && r.status === 'queued')) Object.assign(r, { status: 'failed', error_reason: args.p_reason })
    state.tables.email_campaigns[0].status = rows.some(r => ['sending','sent','delivered','opened','clicked','bounced','complained','unsubscribed'].includes(r.status)) ? 'partially_failed' : 'failed'
    Object.assign(job, { status: 'failed', last_error: args.p_reason, locked_at: null, lease_token: null })
    return { data: true, error: null }
  }
  if (name === 'email_campaign_claim_dispatch_jobs') {
    const job = jobs.find(j => Date.parse(j.run_at) <= Date.now() && (j.status === 'queued' || (j.status === 'running' && Date.parse(j.locked_at) < Date.now() - 300000)))
    if (!job) return { data: [], error: null }
    Object.assign(job, { status: 'running', locked_at: new Date().toISOString(), lease_token: crypto.randomUUID(), attempts: (job.attempts || 0) + 1, last_error: null })
    return { data: [{ ...job }], error: null }
  }
  if (name === 'email_campaign_prepare_send') {
    const job = jobs.find(j => j.id === args.p_job_id)
    const r = rows.find(r => r.id === args.p_recipient_id)
    if (job.lease_token !== args.p_lease_token) return { data: { action: 'lease_lost' }, error: null }
    if (!['queued','sending'].includes(r.status)) return { data: { action: 'skip' }, error: null }
    state.attempts ||= new Map()
    let attempt = state.attempts.get(r.id)
    if (r.status === 'sending' && (!attempt || Date.now() - attempt.firstAttempt > 23 * 3600000)) return { data: { action: 'review' }, error: null }
    if (!attempt) { attempt = { payload: structuredClone(args.p_payload), firstAttempt: Date.now() }; state.attempts.set(r.id, attempt) }
    r.status = 'sending'; r.send_attempts++
    return { data: { action: 'send', payload: attempt.payload, idempotency_key: `campaign:${r.campaign_id}:recipient:${r.id}` }, error: null }
  }
  if (name === 'email_campaign_accept_send') {
    const r = rows.find(r => r.id === args.p_recipient_id)
    Object.assign(r, { provider_message_id: args.p_provider_id, sent_at: new Date().toISOString() })
    if (['queued','sending','failed'].includes(r.status)) r.status = 'sent'
    return { data: null, error: null }
  }
  if (name === 'email_campaign_finish_dispatch') {
    const job = jobs.find(j => j.id === args.p_job_id)
    if (job.lease_token !== args.p_lease_token) return { data: 'lease_lost', error: null }
    const pending = rows.filter(r => ['queued','sending'].includes(r.status))
    const review = pending.some(r => r.status === 'sending' && (!state.attempts?.has(r.id) || Date.now() - state.attempts.get(r.id).firstAttempt > 23 * 3600000))
    if (review) {
      job.status = 'failed'; job.last_error = 'Uncertain provider outcome requires manual reconciliation.'
      state.tables.email_campaigns[0].status = 'partially_failed'
    } else if (pending.length) job.status = 'queued'
    else { job.status = 'completed'; state.tables.email_campaigns[0].status = rows.some(r => r.status === 'failed') ? 'partially_failed' : 'sent' }
    return { data: review ? 'review' : job.status, error: null }
  }
  return { data: state.permitted, error: null }
}

function mockDb() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: vi.fn(deliveryRpc),
    from(table) {
      let operation = 'select', values, options, filters = [], limit
      const execute = () => {
        if ((table === 'email_campaign_assets' && state.assetError) || table === state.eligibilityError) return { data: null, error: new Error('Unavailable') }
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
const test = (patch = {}) => createCampaignTestHandler({ createClient, env, fetcher })(request({ organisationId: org, senderIdentityId: 'sender', requestId: (++testSequence).toString(16).padStart(64,'0'), html: '<script>stale()</script>', contentJson: state.tables.email_campaigns[0].content_json, subject: 'News', ...patch }))
const worker = () => createWorkerHandler({ createClient, env, fetcher })(request({}, { 'x-arch9-email-worker-secret': 'worker-test-secret' }))
const providerCalls = () => fetcher.mock.calls.filter(([url]) => url === 'https://api.resend.com/emails')
const listingId = '22222222-2222-4222-8222-222222222222'
function addListingSource(patch = {}) {
  state.tables.private_listings = [{ id: listingId, organisation_id: org, asking_price: 2400000, listing_status: 'active', is_active: true }]
  state.tables.email_campaigns[0].content_json.ai_campaign = {
    listing_id: listingId, objective: 'new_listing', language: 'en',
    source_snapshot: { version: 1, listing_id: listingId, organisation_id: org, asking_price: 2400000, listing_status: 'active', is_active: true },
    ...patch,
  }
}
function addSecondRecipient() {
  const email = 'second-buyer@example.com'
  state.tables.email_campaign_recipients.push({ ...state.tables.email_campaign_recipients[0], id: 'second-recipient', email })
  for (const table of ['contact_marketing_preferences', 'contact_email_subscriptions', 'email_marketing_contacts']) state.tables[table].push({ ...state.tables[table][0], email })
}
function addSavedShowDay() {
  const id = '33333333-3333-4333-8333-333333333333'
  const start = new Date(Date.now() + 86400000).toISOString()
  const end = new Date(Date.now() + 93600000).toISOString()
  addListingSource({ objective: 'show_day', event: { id, start, end } })
  state.tables.marketing_events = [{ id, organisation_id: org, event_type: 'show_day', subject_type: 'listing', subject_id: listingId, status: 'upcoming', metadata: { visibility: 'public' }, starts_at: start, ends_at: end }]
}
beforeEach(() => {
  testReceipts.clear(); testSequence = 0
  const identity = { id: 'sender', organisation_id: org, display_name: 'Agency', from_email: 'agent@example.com', reply_to_email: 'office@example.com', verification_status: 'verified', sending_paused_at: null, email_sending_domain_id: 'domain' }
  state = { user: { id: 'user', email: 'agent@example.com' }, permitted: true, writes: [], tables: {
    email_campaigns: [{ id: 'campaign', organisation_id: org, subject: 'News', preview_text: 'A property update', content_json: { version: 1, mode: 'advanced', blocks: [], advancedHtml: `<html><body><p>Hello {{first_name}}</p><img src="${image}" alt="Hero"><a href="https://example.com/news?x=1&amp;y=2">View</a></body></html>` }, html: '<script>stale()</script>', status: 'sending', sender_identity_id: 'sender', subscription_type_id: 'property-updates', email_sender_identities: identity }],
    email_sender_identities: [identity],
    email_sending_domains: [{ id: 'domain', organisation_id: org, domain_name: 'example.com', provider_domain_id: 'provider-domain', verification_status: 'verified' }],
    email_campaign_assets: [{ organisation_id: org, storage_path: path, mime_type: 'image/png', byte_size: 8 }],
    email_campaign_dispatch_jobs: [{ id: 'job', campaign_id: 'campaign', organisation_id: org, status: 'queued', run_at: '2020-01-01T00:00:00Z' }],
    email_sending_policies: [{ organisation_id: org, approved_at: '2020-01-01', paused_at: null, daily_recipient_limit: 500, max_recipients_per_worker_run: 50 }],
    email_campaign_recipients: [{ id: 'recipient', organisation_id: org, campaign_id: 'campaign', email: 'buyer@example.com', status: 'queued', recipient_snapshot: { first_name: 'Alex' }, tracking_token: 'recipient-token', send_attempts: 0 }],
    contact_marketing_preferences: [{ organisation_id: org, email: 'buyer@example.com', marketing_consent_status: 'opted_in', unsubscribe_token: 'personal-token' }],
    contact_email_subscriptions: [{ organisation_id: org, email: 'buyer@example.com', subscription_type_id: 'property-updates', status: 'subscribed' }],
    email_marketing_contacts: [{ organisation_id: org, email: 'buyer@example.com', is_valid_email: true }],
  } }
  db = mockDb()
  createClient = vi.fn(() => db)
  env = (key) => ({ SUPABASE_URL: base, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({default:'sb_publishable_test'}), SUPABASE_SECRET_KEYS: JSON.stringify({default:'sb_secret_test'}), EMAIL_CAMPAIGN_WORKER_SECRET: 'worker-test-secret', RESEND_API_KEY: 'resend-test-key' })[key]
  fetcher = vi.fn(async (_url, options) => String(_url).includes('/domains/') ? Response.json({ id: 'provider-domain', name: 'example.com', status: 'verified', records: [] }) : options.method === 'HEAD' ? new Response(null, { headers: { 'content-type': 'image/png', 'content-length': '8' } }) : Response.json({ id: 'message-id' }))
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
  fetcher.mockImplementation(async (url) => String(url).includes('/domains/') ? Response.json({ id: 'provider-domain', name: 'example.com', status: 'verified' }) : new Response(null, { status: 404 }))
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

it('rechecks the category subscription immediately before delivery', async () => {
  state.tables.contact_email_subscriptions[0].status = 'unsubscribed'
  await worker()
  expect(state.tables.email_campaign_recipients[0].status).toBe('suppressed')
  expect(providerCalls()).toHaveLength(0)
})

it.each(['email_suppressions', 'contact_marketing_preferences', 'contact_email_subscriptions', 'email_marketing_contacts'])('keeps recipients queued when eligibility cannot be read: %s', async (table) => {
  state.eligibilityError = table
  await worker()
  expect(state.tables.email_campaign_recipients[0].status).toBe('queued')
  expect(providerCalls()).toHaveLength(0)
})

it('does not deliver after an address becomes invalid', async () => {
  state.tables.email_marketing_contacts[0].is_valid_email = false
  await worker()
  expect(state.tables.email_campaign_recipients[0].status).toBe('suppressed')
  expect(providerCalls()).toHaveLength(0)
})

it('does not send the same claimed recipient on repeated worker runs', async () => {
  await worker()
  await worker()
  expect(providerCalls()).toHaveLength(1)
})

it('checks a persisted AI listing snapshot during review and immediately before actual dispatch', async () => {
  addListingSource()
  expect(await (await check()).json()).toMatchObject({ ready: true, sourceFreshness: { code: 'source_current' } })
  expect(providerCalls()).toHaveLength(0)
  expect(await (await worker()).json()).toMatchObject({ processed: 1 })
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_recipients[0].status).toBe('sent')
})

it.each([
  ['changed price', { asking_price: 2500000 }, 'asking price changed'],
  ['withdrawn listing', { listing_status: 'withdrawn' }, 'no longer active'],
  ['sold listing', { listing_status: 'sold' }, 'no longer active'],
  ['under-offer listing', { listing_status: 'under_offer' }, 'no longer active'],
  ['inactive listing', { is_active: false }, 'no longer active'],
  ['different agency', { organisation_id: '33333333-3333-4333-8333-333333333333' }, 'no longer available'],
])('stops a queued AI email before claims when source is %s', async (_label, patch, reason) => {
  addListingSource()
  Object.assign(state.tables.private_listings[0], patch)
  expect(await (await check()).json()).toMatchObject({ ready: false, errors: [expect.stringContaining(reason)] })
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(db.rpc.mock.calls.some(([name]) => name === 'email_reserve_send')).toBe(false)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'failed', send_attempts: 0, error_reason: expect.stringContaining(reason) })
  expect(state.tables.email_campaigns[0].status).toBe('failed')
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining(reason) })
})

it('fails closed for old AI drafts without provenance rather than silently assuming their facts are current', async () => {
  state.tables.email_campaigns[0].content_json.ai_campaign = { listing_id: listingId, objective: 'new_listing' }
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining('listing snapshot') })
})

it('rejects a removed listing and an expired or invalid show day before claims', async () => {
  addListingSource()
  state.tables.private_listings = []
  expect(await (await check()).json()).toMatchObject({ ready: false, sourceFreshness: { code: 'source_missing' } })
  addListingSource({ objective: 'show_day', event: { start: '2020-01-01T10:00:00+02:00', end: '2020-01-01T12:00:00+02:00' } })
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining('already started or passed') })
})

it('keeps recipients queued on unavailable source reads and can resume once the source is confirmed', async () => {
  addListingSource()
  state.eligibilityError = 'private_listings'
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'queued', send_attempts: 0 })
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'queued', locked_at: null, last_error: expect.stringContaining('could not be checked') })
  state.eligibilityError = null
  await worker()
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'completed', last_error: null })
})

it.each(['sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed'])('preserves existing %s evidence when the source stops the remainder', async (status) => {
  addListingSource()
  state.tables.email_campaign_recipients.push({ id: 'previous', campaign_id: 'campaign', organisation_id: org, status, provider_message_id: 'accepted-message' })
  state.tables.private_listings[0].asking_price = 2500000
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
  expect(state.tables.email_campaign_recipients.find((row) => row.id === 'previous')).toMatchObject({ status, provider_message_id: 'accepted-message' })
  expect(state.tables.email_campaign_recipients[0].status).toBe('failed')
})

it('stops a batch when listing facts change after its first accepted recipient', async () => {
  addListingSource()
  addSecondRecipient()
  const transport = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => {
    const response = await transport(url, options)
    if (url === 'https://api.resend.com/emails') state.tables.private_listings[0].asking_price = 2500000
    return response
  })
  expect(await (await worker()).json()).toMatchObject({ processed: 1 })
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'sent', provider_message_id: 'message-id' })
  expect(state.tables.email_campaign_recipients[1]).toMatchObject({ status: 'failed', send_attempts: 0 })
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('failed')
})

it('retains accepted recipients and queues the rest if a later source read is temporarily unavailable', async () => {
  addListingSource()
  addSecondRecipient()
  const transport = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => {
    const response = await transport(url, options)
    if (url === 'https://api.resend.com/emails') state.eligibilityError = 'private_listings'
    return response
  })
  expect(await (await worker()).json()).toMatchObject({ processed: 1 })
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_recipients[0].status).toBe('sent')
  expect(state.tables.email_campaign_recipients[1]).toMatchObject({ status: 'queued', send_attempts: 0 })
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'queued', locked_at: null, last_error: expect.stringContaining('Remaining recipients stay queued') })
})

it('delivers a current public saved show day after checking its exact listing and times', async () => {
  addSavedShowDay()
  expect(await (await check()).json()).toMatchObject({ ready: true })
  expect(await (await worker()).json()).toMatchObject({ processed: 1 })
  expect(providerCalls()).toHaveLength(1)
})

it.each([
  ['cancelled', { status: 'cancelled' }, 'no longer public'],
  ['made private', { metadata: { visibility: 'private' } }, 'no longer public'],
  ['rescheduled', { starts_at: new Date(Date.now() + 90000000).toISOString() }, 'date or times changed'],
  ['linked to another listing', { subject_id: org }, 'no longer available'],
  ['moved to another agency', { organisation_id: listingId }, 'no longer available'],
])('blocks saved show-day delivery when the event is %s after preparation', async (_label, patch, reason) => {
  addSavedShowDay()
  Object.assign(state.tables.marketing_events[0], patch)
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'failed', send_attempts: 0, error_reason: expect.stringContaining(reason) })
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining(reason) })
})

it('fails a removed event and waits on a temporarily unreadable event without claiming recipients', async () => {
  addSavedShowDay()
  state.tables.marketing_events = []
  expect(await (await check()).json()).toMatchObject({ ready: false, sourceFreshness: { code: 'event_missing' } })
  addSavedShowDay()
  state.eligibilityError = 'marketing_events'
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(db.rpc.mock.calls.some(([name]) => name === 'email_reserve_send')).toBe(false)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'queued', send_attempts: 0 })
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'queued', last_error: expect.stringContaining('show day could not be checked') })
})

it('stops the remaining recipients if a saved show day is cancelled during a batch', async () => {
  addSavedShowDay()
  addSecondRecipient()
  const transport = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => {
    const response = await transport(url, options)
    if (url === 'https://api.resend.com/emails') state.tables.marketing_events[0].status = 'cancelled'
    return response
  })
  expect(await (await worker()).json()).toMatchObject({ processed: 1 })
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'sent', provider_message_id: 'message-id' })
  expect(state.tables.email_campaign_recipients[1]).toMatchObject({ status: 'failed', send_attempts: 0 })
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining('no longer public') })
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


it('sends a setup test to the signed-in inbox without requiring a campaign draft', async () => {
  const response = await test({ setupTest: true, contentJson: null, html: null })
  expect(response.status).toBe(200)
  expect(JSON.parse(providerCalls()[0][1].body)).toMatchObject({ to: [state.user.email], subject: 'Your agency email is ready' })
  expect(db.rpc).toHaveBeenCalledWith('email_reserve_send', expect.objectContaining({ p_test: true, p_actor_id: 'user' }))
})
it('denies setup tests addressed to someone else', async () => {
  expect((await test({ setupTest: true, recipientEmail: 'someone@else.com' })).status).toBe(400)
  expect(providerCalls()).toHaveLength(0)
})
it('stops tests and campaigns when quota reservation fails', async () => {
  db.rpc.mockImplementation(async (name, args) => name === 'email_reserve_send' ? { data: false, error: null } : deliveryRpc(name, args))
  expect((await test({ setupTest: true })).status).toBe(429)
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_recipients[0].status).toBe('queued')
})
it('does not send using cached verification when the provider reports DNS loss', async () => {
  fetcher.mockImplementation(async () => Response.json({ id: 'provider-domain', name: 'example.com', status: 'failed' }))
  expect((await test({ setupTest: true })).status).toBe(400)
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaigns[0].status).toBe('failed')
})
it('requeues a campaign when verification cannot be confirmed during a provider outage', async () => {
  fetcher.mockResolvedValue(new Response(null, { status: 503 }))
  await worker()
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('queued')
  expect(state.tables.email_campaign_recipients[0].status).toBe('queued')
})

it('recovers a provider timeout using the identical saved request and key', async () => {
  const standard = fetcher.getMockImplementation()
  let timedOut = false
  fetcher.mockImplementation(async (url, options) => {
    if (url === 'https://api.resend.com/emails' && !timedOut) { timedOut = true; throw new Error('Fixture provider timeout') }
    return standard(url, options)
  })
  expect((await worker()).status).toBe(503)
  expect(state.tables.email_campaign_recipients[0].status).toBe('sending')
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('queued')
  expect(state.tables.email_campaigns[0].status).toBe('sending')
  state.tables.email_campaign_dispatch_jobs[0].run_at = '2020-01-01T00:00:00Z'
  state.tables.email_campaign_recipients[0].recipient_snapshot.first_name = 'Changed after timeout'
  expect((await worker()).status).toBe(200)
  const calls = providerCalls()
  expect(calls).toHaveLength(2)
  expect(calls[1][1].body).toBe(calls[0][1].body)
  expect(calls[1][1].headers['Idempotency-Key']).toBe(calls[0][1].headers['Idempotency-Key'])
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('completed')
})

it('reclaims a stale running job and safely sends its unattempted recipient', async () => {
  Object.assign(state.tables.email_campaign_dispatch_jobs[0], { status: 'running', locked_at: '2020-01-01T00:00:00Z' })
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_dispatch_jobs[0].attempts).toBe(1)
})

it('requires review for legacy sends whose original request was not recorded', async () => {
  state.tables.email_campaign_recipients[0].status = 'sending'
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('failed')
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
})

it.each(['email_campaign_recipients','email_sending_policies','email_sending_domains'])('does not complete or send when a required read fails: %s', async table => {
  state.eligibilityError = table
  expect((await worker()).status).toBe(503)
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('queued')
  expect(state.tables.email_campaigns[0].status).toBe('sending')
})

it('does not overwrite a callback that arrives before the HTTP send response is saved', async () => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => {
    if (url === 'https://api.resend.com/emails') state.tables.email_campaign_recipients[0].status = 'clicked'
    return standard(url, options)
  })
  expect((await worker()).status).toBe(200)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'clicked', provider_message_id: 'message-id' })
})

it.each([429,500,503])('retains the request for safe retry after provider HTTP %s', async status => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => url === 'https://api.resend.com/emails' ? Response.json({ message: 'Fixture transient failure' }, { status }) : standard(url, options))
  expect((await worker()).status).toBe(503)
  expect(state.tables.email_campaign_recipients[0].status).toBe('sending')
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('queued')
})

it.each(['email_campaign_accept_send','email_campaign_finish_dispatch'])('keeps work recoverable when persistence fails: %s', async name => {
  state.rpcError = name
  expect((await worker()).status).toBe(503)
  expect(state.tables.email_campaigns[0].status).toBe('sending')
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('queued')
})

it('reconciles early callbacks even when there are no queued campaigns', async () => {
  state.tables.email_campaign_dispatch_jobs[0].status = 'completed'
  expect((await worker()).status).toBe(200)
  expect(db.rpc.mock.calls.slice(0,2).map(([name]) => name)).toEqual(['email_campaign_reconcile_provider_receipts','email_campaign_claim_dispatch_jobs'])
  expect(providerCalls()).toHaveLength(0)
})

it('does not start new sends when pending receipt reconciliation fails', async () => {
  state.rpcError = 'email_campaign_reconcile_provider_receipts'
  expect((await worker()).status).toBe(503)
  expect(db.rpc.mock.calls.some(([name]) => name === 'email_campaign_claim_dispatch_jobs')).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
})

it('keeps an ambiguous successful provider response pending instead of claiming it was sent', async () => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => url === 'https://api.resend.com/emails' ? Response.json({}) : standard(url, options))
  expect((await worker()).status).toBe(503)
  expect(state.tables.email_campaign_recipients[0].status).toBe('sending')
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('queued')
})

it('records an explicit permanent provider rejection as a failed recipient', async () => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => url === 'https://api.resend.com/emails' ? Response.json({ message: 'Invalid sender' }, { status: 422 }) : standard(url, options))
  expect((await worker()).status).toBe(200)
  expect(state.tables.email_campaign_recipients[0]).toMatchObject({ status: 'failed', error_reason: 'Invalid sender' })
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
})

it('stops an uncertain retry if the sender was changed after the original request', async () => {
  const standard = fetcher.getMockImplementation()
  let timedOut = false
  fetcher.mockImplementation(async (url, options) => {
    if (url === 'https://api.resend.com/emails' && !timedOut) { timedOut = true; throw new Error('Fixture timeout') }
    return standard(url, options)
  })
  expect((await worker()).status).toBe(503)
  state.tables.email_campaign_dispatch_jobs[0].run_at = '2020-01-01T00:00:00Z'
  state.tables.email_sender_identities[0].from_email = 'changed@example.com'
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(1)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'failed', last_error: expect.stringContaining('Sender changed') })
  expect(state.tables.email_campaigns[0].status).toBe('partially_failed')
})

it('does not send or overwrite a new owner after its dispatch lease is taken over', async () => {
  db.rpc.mockImplementation(async (name, args) => {
    if (name === 'email_campaign_prepare_send') state.tables.email_campaign_dispatch_jobs[0].lease_token = 'another-worker'
    return deliveryRpc(name, args)
  })
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({ status: 'running', lease_token: 'another-worker' })
})

function useArch9Sender({ enabled = true, providerId = 'arch9-provider', providerName = 'updates.arch9.co.za', status = 'verified' } = {}) {
  Object.assign(state.tables.email_sender_identities[0], { sender_mode: 'arch9', from_email: 'noreply@updates.arch9.co.za', email_sending_domain_id: null })
  const previousEnv = env
  env = key => ({ ARCH9_CAMPAIGN_SENDING_ENABLED: enabled ? 'true' : 'false', ARCH9_CAMPAIGN_RESEND_DOMAIN_ID: 'arch9-provider' })[key] ?? previousEnv(key)
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => String(url).endsWith('/domains/arch9-provider') ? Response.json({ id: providerId, name: providerName, status }) : standard(url, options))
}

it('sends campaigns and tests through the same Resend account using the fixed Arch9 address and organisation reply inbox', async () => {
  useArch9Sender()
  state.tables.email_sending_domains = []
  expect((await test({ fromEmail: 'spoof@example.com', sendingDomainId: 'foreign' })).status).toBe(200)
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(2)
  for (const [, options] of providerCalls()) {
    expect(options.headers.Authorization).toBe('Bearer resend-test-key')
    expect(JSON.parse(options.body)).toMatchObject({ from: 'Agency via Arch9 <noreply@updates.arch9.co.za>', reply_to: 'office@example.com' })
  }
  expect(db.rpc).toHaveBeenCalledWith('email_campaign_apply_platform_status', { p_provider_domain_id: 'arch9-provider', p_status: 'verified', p_enabled: true })
  expect(state.tables.email_campaign_dispatch_jobs[0].status).toBe('completed')
})

it.each([
  { enabled: false },
  { status: 'pending' },
  { status: 'failed' },
  { providerId: 'wrong-provider' },
  { providerName: 'another-organisation.co.za' },
])('does not send through an unconfigured or mismatched Arch9 domain: %j', async configuration => {
  useArch9Sender(configuration)
  expect((await test()).status).toBe(400)
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(0)
  expect(state.tables.email_campaigns[0].status).toBe('failed')
})

it('does not substitute the Arch9 sender when the selected custom domain fails', async () => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => String(url).includes('/domains/') ? Response.json({ id: 'provider-domain', name: 'example.com', status: 'failed' }) : standard(url, options))
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(0)
  expect(db.rpc.mock.calls.some(([name]) => name === 'email_campaign_apply_platform_status')).toBe(false)
})

it('does not inspect or depend on the Arch9 domain when sending through a custom domain', async () => {
  expect((await worker()).status).toBe(200)
  expect(JSON.parse(providerCalls()[0][1].body).from).toBe('Agency <agent@example.com>')
  expect(db.rpc.mock.calls.some(([name]) => name === 'email_campaign_apply_platform_status')).toBe(false)
})

it('rejects a corrupt Arch9 identity and a foreign organisation identity before sending', async () => {
  useArch9Sender()
  state.tables.email_sender_identities[0].from_email = 'other@updates.arch9.co.za'
  expect((await test()).status).toBe(400)
  expect((await worker()).status).toBe(200)
  expect(providerCalls()).toHaveLength(0)
  state.tables.email_sender_identities[0].from_email = 'noreply@updates.arch9.co.za'
  state.tables.email_sender_identities[0].organisation_id = 'another-organisation'
  expect((await test()).status).toBe(400)
  expect(providerCalls()).toHaveLength(0)
})

it('uses the campaign reply-to override consistently in preview tests and delivery', async () => {
  useArch9Sender()
  state.tables.email_campaigns[0].reply_to_email = 'replies@organisation.co.za'
  expect((await test({ replyToEmail: 'replies@organisation.co.za' })).status).toBe(200)
  expect((await worker()).status).toBe(200)
  for (const [, options] of providerCalls()) expect(JSON.parse(options.body).reply_to).toBe('replies@organisation.co.za')
})

it('rejects malformed reply addresses before a provider request', async () => {
  useArch9Sender()
  expect((await test({ replyToEmail: 'office@example.com\r\nBcc: somebody@example.com' })).status).toBe(400)
  expect(providerCalls()).toHaveLength(0)
})

it.each(['paused','wait','blocked','lease_lost','skip'])('does not send campaign mail when the final shared gate returns %s', async action => {
  state.slotAction = action
  await worker()
  expect(providerCalls()).toHaveLength(0)
})
it('fails closed when the final sending gate cannot read its state', async () => {
  state.rpcError = 'email_campaign_acquire_send_slot'
  expect((await worker()).status).toBe(503)
  expect(providerCalls()).toHaveLength(0)
})
it.each(['paused','wait','blocked'])('does not send test mail when the shared gate returns %s', async action => {
  state.slotAction = action
  expect((await test({ setupTest: true })).status).toBe(429)
  expect(providerCalls()).toHaveLength(0)
})
it('records a shared cooldown after a provider rate limit response', async () => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => url === 'https://api.resend.com/emails' ? new Response('{}', { status: 429, headers: { 'retry-after': '120' } }) : standard(url, options))
  await worker()
  expect(db.rpc).toHaveBeenCalledWith('email_campaign_provider_backoff', { p_seconds: 120 })
})

it.each([false,true])('returns an actionable JSON error when a test request times out (setup=%s)', async setupTest => {
  const standard=fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url,options) => { if(url==='https://api.resend.com/emails') throw new Error('Fixture timeout');return standard(url,options) })
  const response=await test({setupTest})
  expect(response.status).toBe(502)
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(await response.json()).toMatchObject({error:expect.stringContaining('Check your inbox')})
})
it.each([false,true])('does not report a test accepted without a provider message id (setup=%s)', async setupTest => {
  const standard=fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url,options) => url==='https://api.resend.com/emails'?Response.json({}):standard(url,options))
  expect((await test({setupTest})).status).toBe(502)
})

it('retains a visible wait reason when sending capacity is exhausted', async () => {
  db.rpc.mockImplementation(async(name,args)=>name==='email_reserve_send'?{data:false,error:null}:deliveryRpc(name,args))
  expect((await worker()).status).toBe(200)
  expect(state.tables.email_campaign_dispatch_jobs[0]).toMatchObject({status:'queued',last_error:expect.stringContaining('Waiting for sending capacity')})
  expect(providerCalls()).toHaveLength(0)
})
it('returns a retryable failure when quota storage cannot be read', async () => {
  state.rpcError='email_reserve_send'
  expect((await worker()).status).toBe(503)
  expect(providerCalls()).toHaveLength(0)
})

it('replays a durable test receipt without a second provider call or quota reservation',async()=>{
 const requestId='e'.repeat(64)
 expect((await test({requestId})).status).toBe(200)
 const replay=await test({requestId})
 expect(await replay.json()).toMatchObject({providerMessageId:'message-id',replayed:true})
 expect(providerCalls()).toHaveLength(1)
 expect(db.rpc.mock.calls.filter(([name])=>name==='email_reserve_send')).toHaveLength(1)
})
it('does not resend a test after the provider response was lost',async()=>{
 const standard=fetcher.getMockImplementation(),requestId='f'.repeat(64)
 fetcher.mockImplementation(async(url,options)=>{if(url==='https://api.resend.com/emails')throw Error('Response lost');return standard(url,options)})
 expect((await test({requestId})).status).toBe(502)
 expect((await test({requestId})).status).toBe(409)
 expect(providerCalls()).toHaveLength(1)
})
it('does not resend when the provider accepted but saving the receipt failed',async()=>{
 const original=db.rpc.getMockImplementation(),requestId='d'.repeat(64)
 db.rpc.mockImplementation(async(name,args)=>name==='email_campaign_test_complete'?{error:Error('Write failed')}:original(name,args))
 expect((await test({requestId})).status).toBe(502)
 expect((await test({requestId})).status).toBe(409)
 expect(providerCalls()).toHaveLength(1)
})
it('denies changed payloads under an existing test intent',async()=>{
 const requestId='c'.repeat(64)
 expect((await test({requestId})).status).toBe(200)
 expect((await test({requestId,subject:'Changed subject'})).status).toBe(409)
 expect(providerCalls()).toHaveLength(1)
})
it('allows the same protected request after a pre-provider sending pause is resolved',async()=>{
 const requestId='b'.repeat(64)
 state.slotAction='paused'
 expect((await test({requestId})).status).toBe(429)
 expect(providerCalls()).toHaveLength(0)
 state.slotAction='send'
 expect((await test({requestId})).status).toBe(200)
 expect(providerCalls()).toHaveLength(1)
 const reservations=db.rpc.mock.calls.filter(([name])=>name==='email_reserve_send').map(([,args])=>args.p_key)
 expect(new Set(reservations).size).toBe(1)
})
it.each([null,{action:'send'},{action:'send',id:''}])('fails closed before the provider when the receipt response is incomplete: %j',async data=>{
 const original=db.rpc.getMockImplementation()
 db.rpc.mockImplementation(async(name,args)=>name==='email_campaign_test_claim'?{data,error:null}:original(name,args))
 expect((await test()).status).toBe(503);expect(providerCalls()).toHaveLength(0)
})
it('returns a controlled error when durable receipt storage is unreachable',async()=>{
 const original=db.rpc.getMockImplementation()
 db.rpc.mockImplementation(async(name,args)=>{if(name==='email_campaign_test_claim')throw Error('Storage unreachable');return original(name,args)})
 expect((await test()).status).toBe(503);expect(providerCalls()).toHaveLength(0)
})

it.each([400, 401, 403, 422])('shows definitive test rejection without treating it as an uncertain send: %s', async status => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => url === 'https://api.resend.com/emails' ? Response.json({ message: 'The sending domain is not verified.' }, { status }) : standard(url, options))
  const response = await test()
  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ error: expect.stringContaining('sending domain is not verified'), deliveryUncertain: false })
  expect([...testReceipts.values()][0].status).toBe('rejected')
  expect(providerCalls()).toHaveLength(1)
})
it.each([408, 409, 429, 500])('keeps ambiguous provider outcomes protected from duplicate tests: %s', async status => {
  const standard = fetcher.getMockImplementation(), requestId = 'e'.repeat(64)
  fetcher.mockImplementation(async (url, options) => url === 'https://api.resend.com/emails' ? Response.json({ message: 'Provider pending' }, { status }) : standard(url, options))
  expect((await test({ requestId })).status).toBe(502)
  expect((await test({ requestId })).status).toBe(409)
  expect(providerCalls()).toHaveLength(1)
})
it('stops a custom-domain send when provider sending is disabled despite verified DNS', async () => {
  const standard = fetcher.getMockImplementation()
  fetcher.mockImplementation(async (url, options) => String(url).includes('/domains/') ? Response.json({ id: 'provider-domain', name: 'example.com', status: 'verified', capabilities: { sending: 'disabled' }, records: [] }) : standard(url, options))
  expect((await test()).status).toBe(400)
  await worker()
  expect(providerCalls()).toHaveLength(0)
})

it('tracks decoded and unquoted HTML destinations without corrupting query parameters or Outlook markup', async () => {
 state.tables.email_campaigns[0].content_json.advancedHtml = '<p>News</p><a href="https://example.com/news?one=1&#38;two=2">First</a><a href=https://example.com/news?one=1&amp;two=2>Second</a><!--[if mso]><a href="https://example.com/outlook">Outlook</a><![endif]--><!-- <a href="https://example.com/unused">Comment only</a> -->'
 expect((await worker()).status).toBe(200)
 const links = state.tables.email_campaign_links
 expect(links.map(link => link.target_url)).toEqual(['https://example.com/news?one=1&two=2', 'https://example.com/outlook'])
 const payload = JSON.parse(providerCalls()[0][1].body)
 expect(payload.html).toContain('<!--[if mso]><a href="https://project.supabase.co/functions/v1/email-campaign-track')
 expect(payload.html).toContain('https://example.com/unused')
 expect(payload.html).not.toContain('href=https://example.com/news')
})
it('stores each campaign link once per worker batch while keeping recipient tracking separate', async () => {
 addSecondRecipient()
 expect((await worker()).status).toBe(200)
 expect(providerCalls()).toHaveLength(2)
 expect(state.tables.email_campaign_links).toHaveLength(1)
 const payloads = providerCalls().map(([,options]) => JSON.parse(options.body))
 expect(payloads[0].html).toContain('&amp;r=recipient&amp;')
 expect(payloads[1].html).toContain('&amp;r=second-recipient&amp;')
})
it('retains the original valid destination if optional tracking storage is unavailable', async () => {
 state.eligibilityError = 'email_campaign_links'
 expect((await worker()).status).toBe(200)
 const payload = JSON.parse(providerCalls()[0][1].body)
 expect(payload.html).toContain('href="https://example.com/news?x=1&amp;y=2"')
 expect(payload.html).not.toContain('email-campaign-track?')
})

it('reports a send-control storage outage separately from a genuine quota rejection', async () => {
 state.rpcError = 'email_reserve_send'
 const response = await test()
 expect(response.status).toBe(503)
 expect(await response.json()).toMatchObject({ error: expect.stringContaining('Sending controls are unavailable'), deliveryUncertain: false })
 expect(providerCalls()).toHaveLength(0)
})
it('redacts the provider key from a definite rejection message', async () => {
 const standard=fetcher.getMockImplementation()
 fetcher.mockImplementation(async(url,options)=>url==='https://api.resend.com/emails'?Response.json({message:'Rejected resend-test-key'},{status:403}):standard(url,options))
 const body=await (await test()).json()
 expect(body.error).toContain('[redacted]')
 expect(body.error).not.toContain('resend-test-key')
})
