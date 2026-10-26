import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleCrmFollowUpAi } from './aiCrmFollowUpApi.js'
import { handleAiCampaign } from './aiCampaignApi.js'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org = id(1), actor = id(2), leadId = id(3), requestId = id(4)
const copy = { subject: 'A quick check-in', previewText: 'A considerate invitation to share updated needs.', heading: 'Follow up on property plans', intro: 'Hello, would you like to share whether your property needs have changed? Please let me know if this is no longer relevant.', cta: 'Reply when convenient' }
function fixture(options = {}) {
  let generated = 0
  const calls = [], ledger = []
  const rows = {
    leads: { lead_id: leadId, organisation_id: org, assigned_agent_id: actor, branch_id: null, lead_domain: 'agency', lead_category: 'Buyer', stage: 'Contacted', status: 'Active', area_interest: 'Brooklyn', updated_at: '2026-10-25T09:00:00Z', notes: 'PRIVATE-NOTE', email: 'PRIVATE-EMAIL', phone: 'PRIVATE-PHONE', name: 'PRIVATE-NAME' },
    tasks: [{ task_id: id(5), due_date: '2026-10-24', status: 'Pending', updated_at: '2026-10-24T09:00:00Z' }, { task_id: id(6), due_date: '2026-10-20', status: 'Completed', updated_at: '2026-10-24T09:00:00Z' }],
    lead_activities: [{ activity_id: id(7), activity_date: '2026-10-24T10:00:00Z', created_at: '2026-10-24T10:00:00Z' }],
  }
  const scoped = { auth: { getUser: async () => ({ data: { user: { id: actor } } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'bridge_has_organisation_membership' ? options.member !== false : options.access !== false } }, from(table) {
    const filters = []; let fields
    const result = () => {
      const projection = (row) => row && Object.fromEntries(fields.split(',').map((key) => [key, row[key]]))
      return { data: Array.isArray(rows[table]) ? rows[table].map(projection) : projection(rows[table]), count: table === 'lead_activities' ? options.activityCount ?? 3 : undefined, ...(options.readFailure ? { error: { message: 'private database details' } } : {}) }
    }
    const query = { select(value) { fields = value; calls.push({ table, fields, filters }); return query }, eq(key, value) { filters.push([key, value]); return query }, order() { return query }, limit() { return query }, maybeSingle: async () => result(), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) } }; return query
  } }
  const admin = { rpc: async (name, args) => { ledger.push({ name, args }); return name === 'ai_crm_follow_up_reserve' ? options.allowance || { data: { claimed: true, provider: 'anthropic', model: 'configured-model', input_rate: 1, output_rate: 5, writing_preferences: 'PRIVATE-AGENCY-PREFERENCES' } } : { data: null } } }
  const run = (patch = {}, handler = handleCrmFollowUpAi) => handler({ method: 'POST', headers: { authorization: 'Bearer user' }, body: { organisationId: org, leadId, action: 'crm_follow_up_brief', ...patch }, env: { SUPABASE_URL: 'https://db.example.com', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'secret', OPENAI_API_KEY: 'other-secret' }, clientFactory: (_, key) => key === 'service' ? admin : scoped, now: new Date('2026-10-25T10:00:00Z'), generate: async (input) => { generated++; calls.push({ input }); options.afterGenerate?.(rows); if (options.failure) throw new Error('private provider detail'); return { copy, inputTokens: 100, outputTokens: 20, costKnown: true } } })
  const proposal = async (patch = {}) => { const { body } = await run(); return run({ action: 'crm_follow_up_generate', expectedUpdatedAt: body.brief?.updatedAt, sourceFingerprint: body.brief?.fingerprint, requestId, language: 'en', tone: 'warm', ...patch }) }
  return { run, proposal, calls, ledger, rows, generated: () => generated }
}
test('free source-linked brief and current-source check do not reserve money or read private fields', async () => {
  const f = fixture(), result = await f.run()
  assert.equal(result.status, 200); assert.equal(result.body.brief.openTaskCount, 1); assert.equal(result.body.brief.overdueTaskCount, 1)
  assert.equal(result.body.brief.activityCount, 3); assert.equal(result.body.brief.lastActivityAt, '2026-10-24T10:00:00Z')
  assert.equal(result.body.brief.sourcePath, `/pipeline/leads/${leadId}?tab=activity`)
  assert.ok(!JSON.stringify(result.body).includes('PRIVATE-'))
  assert.ok(f.calls.filter((call) => call.table).every((call) => !/notes|email|phone|name|description|contact|title/.test(call.fields)))
  assert.ok(f.calls.filter((call) => call.table).every((call) => call.filters.some(([key, value]) => key === 'organisation_id' && value === org)))
  assert.equal((await f.run({ action: 'crm_follow_up_check', expectedUpdatedAt: result.body.brief.updatedAt, sourceFingerprint: result.body.brief.fingerprint })).status, 200)
  assert.equal(f.ledger.length, 0); assert.equal(f.generated(), 0)
})
test('CRM generation sends only approved low-detail facts, uses the configured provider and settles existing accounting', async () => {
  const f = fixture(), result = await f.proposal({ brief: 'PRIVATE-UNTRUSTED-INPUT' })
  assert.equal(result.status, 200); assert.equal(result.body.proposal.outreach, copy.intro)
  const input = f.calls.find((call) => call.input).input
  assert.deepEqual(Object.keys(input.facts).sort(), ['activityCount', 'area', 'category', 'openTaskCount', 'overdueTaskCount', 'stage'])
  assert.ok(!JSON.stringify(input).includes('PRIVATE-')); assert.ok(!JSON.stringify(input).includes(leadId)); assert.ok(!JSON.stringify(input).includes('2026'))
  assert.equal(input.campaignKind, 'crm'); assert.equal(input.model, 'configured-model')
  assert.equal(f.ledger[0].name, 'ai_crm_follow_up_reserve'); assert.equal(f.ledger[0].args.p_lead, leadId)
  assert.equal(f.ledger[1].name, 'ai_campaign_settle'); assert.equal(f.ledger[1].args.p_cost, 0.0002)
  assert.equal(f.calls.some((call) => /create|send|task.*save/i.test(call.name || '')), false)
})
test('lead action scope and source revision changes fail before budget reservation', async () => {
  for (const options of [{ member: false }, { access: false }, { readFailure: true }]) {
    const f = fixture(options); assert.notEqual((await f.proposal()).status, 200); assert.equal(f.ledger.length, 0)
  }
  const f = fixture(), result = await f.run()
  f.rows.leads.updated_at = '2026-10-25T11:00:00Z'
  assert.equal((await f.run({ action: 'crm_follow_up_generate', expectedUpdatedAt: result.body.brief.updatedAt, sourceFingerprint: result.body.brief.fingerprint, requestId, language: 'en', tone: 'warm' })).status, 409)
  assert.equal(f.ledger.length, 0)
  f.rows.leads.lead_domain = 'attorney'; assert.equal((await f.run()).status, 404)
})
test('saved task changes during generation reject late proposals while settling real paid usage', async () => {
  const f = fixture({ afterGenerate: (rows) => { rows.tasks[0].status = 'Completed' } }), result = await f.proposal()
  assert.equal(result.status, 409); assert.equal(result.body.code, 'CRM_FOLLOW_UP_CHANGED')
  assert.equal(f.ledger[1].args.p_success, true); assert.equal(f.ledger[1].args.p_result.applicability, 'stale')
})
test('source checks block stale copy or task preparation, including newly logged activities', async () => {
  const f = fixture(), first = await f.run()
  f.rows.lead_activities[0].activity_date = '2026-10-25T11:00:00Z'
  const result = await f.run({ action: 'crm_follow_up_check', expectedUpdatedAt: first.body.brief.updatedAt, sourceFingerprint: first.body.brief.fingerprint })
  assert.equal(result.status, 409); assert.equal(f.ledger.length, 0)
})
test('unknown categories, stages and suspicious location text never enter model facts', async () => {
  const f = fixture()
  f.rows.leads.lead_category = 'PRIVATE-CATEGORY'; f.rows.leads.stage = 'PRIVATE-STAGE'; f.rows.leads.area_interest = 'private@example.com 123'
  assert.equal((await f.proposal()).status, 200)
  assert.deepEqual(f.calls.find((call) => call.input).input.facts, { category: 'property enquiry', stage: 'not classified', area: 'not specified', openTaskCount: 1, overdueTaskCount: 1, activityCount: 3 })
})
test('budget rejection, provider failure and completed replay never trigger an alternative payer or paid retry', async () => {
  const blocked = fixture({ allowance: { error: { message: 'spending limit reached' } } }); assert.equal((await blocked.proposal()).status, 429); assert.equal(blocked.generated(), 0)
  const failed = fixture({ failure: true }); assert.equal((await failed.proposal()).status, 502); assert.equal(failed.generated(), 1); assert.equal(failed.ledger[1].args.p_cost, null)
  const replay = fixture({ allowance: { data: { status: 'succeeded', result: { applicability: 'current', proposal: { outreach: copy.intro } } } } }); assert.equal((await replay.proposal()).status, 200); assert.equal(replay.generated(), 0)
  const openai = fixture({ allowance: { data: { claimed: true, provider: 'openai', model: 'configured-openai', input_rate: 1, output_rate: 5 } } }); assert.equal((await openai.proposal()).status, 200); assert.equal(openai.calls.find((call) => call.input).input.provider, 'openai')
})
test('the existing authenticated AI route dispatches CRM actions without requiring a listing', async () => {
  const f = fixture(), result = await f.run({}, handleAiCampaign)
  assert.equal(result.status, 200); assert.equal(result.body.brief.leadId, leadId)
})
