import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleAiCampaign } from './aiCampaignApi.js'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), actor = id(2), listingId = id(3), campaignId = id(4), requestId = id(5), category = id(6), eventId = id(7)
const copy = { subject: 'Welcome home', previewText: 'Discover this home', heading: 'Take a closer look', intro: 'Contact your agent for a viewing.', cta: 'View property' }
function fixture(overrides = {}) {
  const calls = []; const reservations = []; let generated = 0
  const rows = { private_listings: { id: listingId, organisation_id: org, is_active: true, updated_at: '2026-10-25T10:00:00+00:00', listing_status: 'active', asking_price: 2000000, title: 'Home', suburb: 'Sea Point' }, email_campaigns: { id: campaignId, organisation_id: org, created_by: actor, status: 'draft', updated_at: '2026-10-25T10:00:00+00:00' }, organisation_branding: { organisation_display_name: 'Agency', primary_brand_color: '#123456' }, organisations: { name: 'Agency' }, email_subscription_types: { id: category }, marketing_events: { id: eventId, organisation_id: org, event_type: 'show_day', subject_type: 'listing', subject_id: listingId, status: 'upcoming', metadata: { visibility: 'public' }, starts_at: '2030-03-02T08:00:00.000Z', ends_at: '2030-03-02T09:00:00.000Z' }, ...overrides.rows }
  const scoped = {
    auth: { getUser: async () => ({ data: { user: { id: actor } } }) },
    from(table) {
      const filters = []; const query = { select(fields) { calls.push({ table, fields, filters }); return query }, eq(field, value) { filters.push([field, value]); return query }, in(field, values) { filters.push([field, values]); return query }, order() { return query }, limit() { return query }, maybeSingle() { return Promise.resolve({ data: structuredClone(rows[table]) }) }, then(resolve) { return Promise.resolve({ data: rows[table] || [] }).then(resolve) } }; return query
    },
    rpc: async (name, args) => {
      if (name === 'bridge_has_organisation_membership') assert.deepEqual(args, { target_organisation_id: org })
      return { data: name === 'bridge_has_organisation_membership' ? overrides.member !== false : name === 'email_campaign_can_send' ? false : name === 'ai_campaign_match_buyers' ? { contact_ids: overrides.matches || [], explanation: 'Saved preferences' } : 0 }
    },
  }
  const admin = { rpc: async (name, args) => {
    reservations.push({ name, args })
    if (name === 'ai_campaign_reserve') return overrides.reservation || { data: { claimed: true, status: 'reserved', provider: 'anthropic', model: 'configured-model', input_rate: 1, output_rate: 5 } }
    return { data: null }
  } }
  const run = (body = {}, extra = {}) => handleAiCampaign({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { organisationId: org, action: 'generate', listingId, campaignId, requestId, objective: 'new_listing', language: 'en', ...body }, env: { SUPABASE_URL: 'https://project.test', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'provider-secret' }, clientFactory: (_, key) => key === 'service' ? admin : scoped, generate: async (input) => { generated++; calls.push({ input }); if (overrides.providerFailure) throw new Error('secret diagnostic'); overrides.afterGenerate?.(rows); return { copy: overrides.generatedCopy || copy, inputTokens: 100, outputTokens: 50, costKnown: true } }, ...extra })
  return { run, calls, reservations, generated: () => generated }
}
test('requires authentication, membership, visible listing and editable draft before spend', async () => {
  const missing = fixture(); assert.equal((await missing.run({}, { headers: {} })).status, 401)
  for (const options of [{ member: false }, { rows: { private_listings: null } }, { rows: { email_campaigns: null } }, { rows: { email_campaigns: { id: campaignId, status: 'sent' } } }, { rows: { email_campaigns: { id: campaignId, status: 'draft', created_by: id(99) } } }]) {
    const f = fixture(options); assert.notEqual((await f.run()).status, 200); assert.equal(f.generated(), 0); assert.equal(f.reservations.length, 0)
  }
})
test('generation uses allowlisted facts under user RLS, then settles actual usage', async () => {
  const f = fixture(); const result = await f.run()
  assert.equal(result.status, 200); assert.equal(result.body.brand.name, 'Agency'); assert.equal(f.generated(), 1)
  const tables = f.calls.filter((call) => call.table)
  assert.ok(tables.every((call) => call.fields !== '*'))
  assert.ok(tables.every((call) => !/fica|bank|document|seller_email/i.test(call.fields)))
  assert.equal(f.reservations[0].args.p_actor, actor)
  assert.equal(f.reservations[1].args.p_cost, 0.00035)
  assert.ok(!JSON.stringify(result).includes('provider-secret'))
})
test('budget rejection and request replay never invoke another model', async () => {
  const blocked = fixture({ reservation: { error: { message: 'Agency AI spending limit reached' } } }); assert.equal((await blocked.run()).status, 429); assert.equal(blocked.generated(), 0)
  const replay = fixture({ reservation: { data: { status: 'succeeded', result: { copy } } } }); assert.deepEqual((await replay.run()).body.copy, copy); assert.equal(replay.generated(), 0)
  const pending = fixture({ reservation: { data: { status: 'reserved', claimed: false } } }); assert.equal((await pending.run()).status, 409); assert.equal(pending.generated(), 0)
})
test('failure records conservative usage and hides provider diagnostics', async () => {
  const f = fixture({ providerFailure: true }); const result = await f.run()
  assert.equal(result.status, 502); assert.ok(!JSON.stringify(result).includes('secret diagnostic'))
  assert.equal(f.reservations[1].args.p_cost, null); assert.equal(f.reservations[1].args.p_success, false)
})
test('zero matching buyers fails closed, and missing show-day or reduction facts spend nothing', async () => {
  const f = fixture(); const audience = await f.run({ action: 'audience', subscriptionTypeId: category })
  assert.equal(audience.status, 200); assert.deepEqual(audience.body.audienceFilter.contact_ids, ['00000000-0000-0000-0000-000000000000'])
  assert.equal((await f.run({ objective: 'show_day' })).status, 400)
  assert.equal((await f.run({ objective: 'price_reduction', previousPrice: 100000 })).status, 400)
  assert.equal(f.generated(), 0)
})
test('current audiences accept only established structured filters with no bypass keys', async () => {
  const f = fixture()
  assert.equal((await f.run({ action: 'audience', subscriptionTypeId: category, useCurrentAudience: true, audienceFilter: { bypass_consent: true } })).status, 400)
  const preview = await f.run({ action: 'audience', subscriptionTypeId: category, useCurrentAudience: true, audienceFilter: { contact_ids: [id(8)] } })
  assert.equal(preview.status, 200); assert.deepEqual(preview.body.audienceFilter, { contact_ids: [id(8)] })
  assert.equal(f.generated(), 0)
})
test('validates actual calendar dates and preserves confirmed SAST show-day facts', async () => {
  const f = fixture()
  assert.equal((await f.run({ objective: 'show_day', showStart: '2030-02-30T10:00:00+02:00', showEnd: '2030-03-02T11:00:00+02:00' })).status, 400)
  const result = await f.run({ objective: 'show_day', showStart: '2030-03-02T10:00:00+02:00', showEnd: '2030-03-02T11:00:00+02:00' })
  assert.equal(result.status, 200); assert.equal(result.body.event.start, '2030-03-02T10:00:00+02:00')
})
test('selective endpoint preserves other fields and binds the proposal to request, campaign and source', async () => {
  const previous = { ...copy, subject: 'My manual subject 2026', intro: 'My earlier wording' }
  const f = fixture({ generatedCopy: { ...copy, subject: 'Attempted unrelated change', intro: 'A proposed introduction' } })
  const result = await f.run({ targetField: 'intro', previous, expectedCampaignUpdatedAt: '2026-10-25T10:00:00+00:00' })
  assert.equal(result.status, 200)
  assert.equal(result.body.copy.subject, previous.subject)
  assert.equal(result.body.copy.intro, 'A proposed introduction')
  assert.deepEqual(result.body.changedFields, ['intro'])
  assert.equal(result.body.requestId, requestId); assert.equal(result.body.campaignId, campaignId)
  assert.equal(result.body.campaignUpdatedAt, '2026-10-25T10:00:00+00:00')
  assert.equal(result.body.source.listingId, listingId); assert.match(result.body.source.fingerprint, /^[a-f0-9]{64}$/)
  assert.equal(f.calls.find((call) => call.input)?.input.model, 'configured-model')
})
test('rejects stale saved revision and invalid refinement before reserving or spending', async () => {
  const f = fixture()
  const stale = await f.run({ expectedCampaignUpdatedAt: '2026-10-24T10:00:00+00:00' })
  assert.equal(stale.status, 409); assert.equal(stale.body.code, 'CAMPAIGN_CHANGED')
  assert.equal((await f.run({ expectedCampaignUpdatedAt: 'invalid' })).status, 400)
  assert.equal((await f.run({ targetField: 'audience', previous: copy })).status, 400)
  assert.equal((await f.run({ targetField: 'intro' })).status, 400)
  assert.equal(f.generated(), 0); assert.equal(f.reservations.length, 0)
})
test('late generation cannot overwrite a changed campaign or listing but actual usage is settled', async () => {
  for (const afterGenerate of [(rows) => { rows.email_campaigns.updated_at = '2026-10-25T10:01:00+00:00' }, (rows) => { rows.private_listings.asking_price = 2100000 }, (rows) => { rows.email_campaigns.status = 'scheduled' }, (rows) => { rows.private_listings = null }]) {
    const f = fixture({ afterGenerate }); const result = await f.run()
    assert.equal(result.status, 409); assert.equal(result.body.code, 'CAMPAIGN_CHANGED')
    assert.equal(result.body.usageId, requestId); assert.equal(f.reservations[1].args.p_success, true)
    assert.equal(f.reservations[1].args.p_cost, 0.00035)
    assert.equal(f.reservations[1].args.p_result.applicability, 'stale')
    assert.ok(!result.body.copy)
  }
})
test('completed stale retries do not return an applicable proposal or call the provider', async () => {
  const f = fixture({ reservation: { data: { status: 'succeeded', result: { copy, applicability: 'stale', usageId: requestId, requestId } } } })
  assert.equal((await f.run()).status, 409); assert.equal(f.generated(), 0)
})
test('planning exposes missing source facts and a deterministic next action without model or budget usage', async () => {
  const f = fixture()
  const result = await f.run({ action: 'plan', objective: 'show_day' })
  assert.equal(result.status, 200); assert.equal(result.body.plan.nextAction, 'confirm_details')
  assert.deepEqual(result.body.plan.channels, ['email'])
  assert.ok(result.body.plan.needs.some((need) => need.field === 'showDay'))
  assert.ok(result.body.plan.needs.some((need) => need.field === 'destination'))
  assert.equal(result.body.plan.facts.price, 2000000)
  assert.equal(f.generated(), 0); assert.equal(f.reservations.length, 0)
})
test('an absent or invalid configured model never triggers a paid fallback', async () => {
  const f = fixture({ reservation: { data: { status: 'reserved', claimed: true, model: '', input_rate: 1, output_rate: 5 } } })
  assert.equal((await f.run()).status, 502)
  assert.equal(f.generated(), 0); assert.equal(f.reservations[1].args.p_cost, 0)
})
test('pipeline, under-offer and inactive listings cannot be generated or planned', async () => {
  for (const listing_status of ['seller_lead', 'intake', 'mandate_sent', 'under_offer', 'transaction_created', 'withdrawn', 'sold']) {
    const f = fixture({ rows: { private_listings: { id: listingId, organisation_id: org, is_active: true, listing_status, asking_price: 2000000 } } })
    assert.equal((await f.run()).status, 404)
    assert.equal((await f.run({ action: 'plan' })).status, 404)
    assert.equal(f.generated(), 0); assert.equal(f.reservations.length, 0)
  }
})
test('signed live listings and supported active aliases can be planned and generated only while active', async () => {
  for (const listing_status of ['active', 'listing_active', 'in_progress', 'mandate_signed', 'live', 'published']) {
    const row = { id: listingId, organisation_id: org, is_active: true, listing_status, asking_price: 2000000, title: 'Market-ready home' }
    const ready = fixture({ rows: { private_listings: row } })
    assert.equal((await ready.run({ action: 'plan' })).status, 200, `plan ${listing_status}`)
    assert.equal(ready.generated(), 0)
    assert.equal((await ready.run()).status, 200, `generate ${listing_status}`)
    assert.equal(ready.generated(), 1)
    const inactive = fixture({ rows: { private_listings: { ...row, is_active: false } } })
    assert.equal((await inactive.run({ action: 'plan' })).status, 404, `inactive plan ${listing_status}`)
    assert.equal((await inactive.run()).status, 404, `inactive generation ${listing_status}`)
    assert.equal(inactive.generated(), 0); assert.equal(inactive.reservations.length, 0)
  }
})
test('saved show-day generation uses authorised event instants and retains its event id for later checks', async () => {
  const f = fixture()
  const result = await f.run({ objective: 'show_day', eventId, showStart: '2030-03-02T10:00:00+02:00', showEnd: '2030-03-02T11:00:00+02:00' })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.event, { id: eventId, start: '2030-03-02T08:00:00.000Z', end: '2030-03-02T09:00:00.000Z' })
  assert.ok(f.calls.filter((call) => call.table === 'marketing_events').every((call) => call.filters.some(([key, value]) => key === 'organisation_id' && value === org) && call.filters.some(([key, value]) => key === 'id' && value === eventId)))
  assert.ok(!JSON.stringify(f.calls.find((call) => call.input)?.input.facts).includes(eventId))
  const plan = await f.run({ action: 'plan', objective: 'show_day', eventId })
  assert.equal(plan.status, 200); assert.equal(plan.body.plan.event.id, eventId)
  assert.ok(!plan.body.plan.needs.some((need) => need.field === 'showDay'))
})
test('rejects changed times, wrong listing, private, cancelled or cross-agency saved events before spend', async () => {
  const f = fixture()
  assert.equal((await f.run({ objective: 'show_day', eventId, showStart: '2030-03-02T12:00:00+02:00' })).status, 409)
  assert.equal((await f.run({ eventId })).status, 400)
  assert.equal((await f.run({ objective: 'show_day', eventId: 'not-an-id' })).status, 400)
  assert.equal(f.generated(), 0)
  for (const patch of [{ status: 'cancelled' }, { organisation_id: id(99) }, { subject_id: id(99) }, { metadata: { visibility: 'private' } }, { event_type: 'launch' }]) {
    const row = { id: eventId, organisation_id: org, event_type: 'show_day', subject_type: 'listing', subject_id: listingId, status: 'upcoming', metadata: { visibility: 'public' }, starts_at: '2030-03-02T08:00:00.000Z', ends_at: '2030-03-02T09:00:00.000Z', ...patch }
    const blocked = fixture({ rows: { marketing_events: row } })
    assert.equal((await blocked.run({ objective: 'show_day', eventId })).status, 409)
    assert.equal(blocked.generated(), 0); assert.equal(blocked.reservations.length, 0)
  }
})
test('saved event reschedule or cancellation during generation yields a stale proposal with settled usage', async () => {
  for (const afterGenerate of [(rows) => { rows.marketing_events.status = 'cancelled' }, (rows) => { rows.marketing_events.starts_at = '2030-03-02T10:00:00Z' }, (rows) => { rows.marketing_events = null }]) {
    const f = fixture({ afterGenerate })
    assert.equal((await f.run({ objective: 'show_day', eventId })).status, 409)
    assert.equal(f.reservations[1].args.p_success, true)
    assert.equal(f.reservations[1].args.p_result.applicability, 'stale')
  }
})
test('the configured OpenAI provider uses only its matching key and never Anthropic fallback', async () => {
  const allowance = { data: { status: 'reserved', claimed: true, provider: 'openai', model: 'agency-openai-model', input_rate: 1, output_rate: 5 } }
  const env = { SUPABASE_URL: 'https://project.test', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'openai-only-secret' }
  const f = fixture({ reservation: allowance })
  assert.equal((await f.run({}, { env })).status, 200)
  assert.equal(f.calls.find((call) => call.input).input.provider, 'openai')
  assert.equal(f.calls.find((call) => call.input).input.apiKey, 'openai-only-secret')
  const missing = fixture({ reservation: allowance })
  assert.equal((await missing.run()).status, 503)
  assert.equal(missing.generated(), 0); assert.equal(missing.reservations[1].args.p_cost, 0)
})
