import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleBusinessCampaignAi } from './aiBusinessCampaignApi.js'
import { createContactProvenance, GENERAL_CONTACT_FIELDS } from '../../src/services/campaignContactProvenance.js'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), actor = id(2), campaignId = id(3), requestId = id(4)
const copy = { subject: 'Your next property chapter', previewText: 'A helpful invitation to discuss your plans.', heading: 'A fresh perspective on your plans', intro: 'Let us help you explore your property questions at your own pace.', cta: 'Talk to your agent' }
function fixture(options = {}) {
  let generated = 0; const calls = [], ledger = []
  const rows = {
    marketing_campaigns: { id: campaignId, organisation_id: org, created_by: actor, status: 'draft', revision: 2, campaign_builder: { template: 'sellers', reviewed: true, permission: false, source: { agencyName: 'Oak', language: 'en-ZA', tone: 'Professional' }, details: { area: 'Brooklyn', offer: 'PRIVATE-EVIDENCE-NOT-FOR-MODEL' } }, channel_content: { email: { title: 'Thinking of selling?', body: 'Hi there,\n\nExplore your next move.\n\nConfirmed offer and terms 2026.\n\nReply: https://agency.example.com/sell', timing: 'Review before use' }, whatsapp: { title: 'Manual title', body: 'Manual WhatsApp body', timing: 'Manual timing' } } },
    marketing_campaign_setup: { revision: 3, confirmed_preferences: { agencyName: 'Oak', agencyEmail: 'PRIVATE-CONTACT-NOT-FOR-MODEL' } }, ...options.rows,
  }
  if (rows.marketing_campaigns?.campaign_builder) rows.marketing_campaigns.campaign_builder.contactProvenance = { ...createContactProvenance(rows.marketing_campaigns.campaign_builder.source, GENERAL_CONTACT_FIELDS), confirmed: true }
  const scoped = { auth: { getUser: async () => ({ data: { user: { id: actor } } }) }, rpc: async (name) => ({ data: name === 'bridge_has_organisation_membership' ? options.member !== false : false }), from(table) {
    const filters = []; const query = { select(fields) { calls.push({ table, fields, filters }); return query }, eq(key, value) { filters.push([key, value]); return query }, maybeSingle: async () => ({ data: structuredClone(rows[table]) }) }; return query
  } }
  const admin = { rpc: async (name, args) => { ledger.push({ name, args }); return name === 'ai_business_campaign_reserve' ? options.allowance || { data: { claimed: true, provider: 'anthropic', model: 'configured-agency-model', input_rate: 1, output_rate: 5 } } : { data: null } } }
  const run = (patch = {}) => handleBusinessCampaignAi({ method: 'POST', headers: { authorization: 'Bearer user' }, body: { organisationId: org, campaignId, requestId, expectedRevision: 2, channel: 'email', target: 'both', ...patch }, env: { SUPABASE_URL: 'https://db.example.com', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'secret' }, clientFactory: (_, key) => key === 'service' ? admin : scoped, generate: async (input) => { generated++; calls.push({ input }); options.afterGenerate?.(rows); if (options.failure) throw new Error('secret-provider-diagnostic'); return { copy, inputTokens: 100, outputTokens: 50, costKnown: true } } })
  return { run, calls, ledger, generated: () => generated, rows }
}
test('business AI uses the shared configured provider and ledger without sending private evidence or recipients', async () => {
  const f = fixture(), result = await f.run()
  assert.equal(result.status, 200); assert.equal(result.body.revision, 2)
  assert.equal(f.calls.find((item) => item.input).input.model, 'configured-agency-model')
  const input = JSON.stringify(f.calls.find((item) => item.input).input)
  assert.ok(!input.includes('PRIVATE-EVIDENCE')); assert.ok(!input.includes('PRIVATE-CONTACT'))
  assert.equal(f.ledger[0].name, 'ai_business_campaign_reserve'); assert.equal(f.ledger[1].args.p_cost, 0.00035)
  assert.ok(result.body.content.email.body.includes('Confirmed offer and terms 2026.'))
  assert.ok(result.body.content.email.body.includes('https://agency.example.com/sell'))
  assert.deepEqual(result.body.content.whatsapp, f.rows.marketing_campaigns.channel_content.whatsapp)
  assert.equal(result.body.content.email.timing, 'Review before use')
  assert.ok(f.calls.filter((call) => call.table).every((call) => call.filters.some(([field, value]) => field === 'organisation_id' && value === org)))
})
test('business access, revision, source and permission errors reserve no money', async () => {
  for (const options of [{ member: false }, { rows: { marketing_campaigns: null } }, { rows: { marketing_campaign_setup: null } }]) {
    const f = fixture(options); assert.notEqual((await f.run()).status, 200); assert.equal(f.generated(), 0); assert.equal(f.ledger.length, 0)
  }
  const f = fixture()
  assert.equal((await f.run({ expectedRevision: 1 })).status, 409)
  assert.equal((await f.run({ channel: 'meta' })).status, 400)
  f.rows.marketing_campaigns.campaign_builder.template = 'client-success'
  assert.equal((await f.run()).status, 400)
  assert.equal(f.ledger.length, 0)
})
test('legacy or unconfirmed public-contact provenance blocks AI before budget reservation', async () => {
  const f = fixture()
  delete f.rows.marketing_campaigns.campaign_builder.contactProvenance
  assert.equal((await f.run()).status, 400)
  assert.equal(f.ledger.length, 0)
  f.rows.marketing_campaigns.campaign_builder.contactProvenance = createContactProvenance(f.rows.marketing_campaigns.campaign_builder.source, GENERAL_CONTACT_FIELDS)
  assert.equal((await f.run()).status, 400)
  assert.equal(f.generated(), 0)
})
test('title-only proposals retain complete manual body and other channels', async () => {
  const f = fixture(), result = await f.run({ target: 'title' })
  assert.equal(result.status, 200)
  assert.equal(result.body.content.email.body, f.rows.marketing_campaigns.channel_content.email.body)
  assert.equal(result.body.content.email.title, copy.heading)
})
test('a late business proposal is rejected and actual provider usage settled when its draft changes', async () => {
  const f = fixture({ afterGenerate: (rows) => { rows.marketing_campaigns.revision++ } })
  const result = await f.run()
  assert.equal(result.status, 409); assert.equal(result.body.code, 'BUSINESS_CAMPAIGN_CHANGED')
  assert.equal(f.ledger[1].args.p_success, true); assert.equal(f.ledger[1].args.p_result.applicability, 'stale')
})
test('budget rejection, replay and provider failure do not trigger fallback requests', async () => {
  const blocked = fixture({ allowance: { error: { message: 'spending limit reached' } } }); assert.equal((await blocked.run()).status, 429); assert.equal(blocked.generated(), 0)
  const replay = fixture({ allowance: { data: { status: 'succeeded', result: { applicability: 'current', copy } } } }); assert.equal((await replay.run()).status, 200); assert.equal(replay.generated(), 0)
  const failed = fixture({ failure: true }); assert.equal((await failed.run()).status, 502); assert.equal(failed.generated(), 1); assert.equal(failed.ledger[1].args.p_cost, null)
})
test('approved source text in the opening is retained and excluded from model refinement context', async () => {
  const f = fixture()
  f.rows.marketing_campaigns.channel_content.email.body = 'PRIVATE-EVIDENCE-NOT-FOR-MODEL\n\nKeep the contact destination.'
  const result = await f.run({ target: 'opening' })
  assert.equal(result.status, 200)
  assert.ok(!JSON.stringify(f.calls.find((call) => call.input).input).includes('PRIVATE-EVIDENCE'))
  assert.ok(result.body.content.email.body.includes('PRIVATE-EVIDENCE-NOT-FOR-MODEL'))
  assert.ok(result.body.content.email.body.startsWith(copy.intro))
})
