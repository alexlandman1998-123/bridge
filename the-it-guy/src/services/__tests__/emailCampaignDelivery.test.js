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
const test = (patch = {}) => createCampaignTestHandler({ createClient, env, fetcher })(request({ organisationId: org, senderIdentityId: 'sender', html: '<script>stale()</script>', contentJson: state.tables.email_campaigns[0].content_json, subject: 'News', ...patch }))
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
  const identity = { id: 'sender', organisation_id: org, display_name: 'Agency', from_email: 'agent@example.com', verification_status: 'verified', sending_paused_at: null, email_sending_domain_id: 'domain' }
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
  db.rpc.mockImplementation(async (name) => ({ data: name !== 'email_reserve_send', error: null }))
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
