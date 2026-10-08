import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendPortalLeadNotifications } from '../property24/leadImportService.js'

const input = { organisationId: 'org-one', lead: { leadId: 'lead-one', externalReference: 'p24-123', contactName: 'Taylor Buyer', phone: '0820000000', message: 'Please call.' }, listing: { id: 'listing-one', title: 'Unit 12', assigned_agent_id: 'agent-one', assigned_agent_email: 'agent@example.com' } }
function deliveryFixture(results = []) {
  const bodies = []
  const options = { supabaseUrl: 'https://supabase.invalid', serviceRoleKey: 'fixture-only', appUrl: 'https://app.arch9.co.za', fetchImpl: async (_url, request) => {
    bodies.push(JSON.parse(request.body))
    const result = results.shift() || { ok: true, sent: true, providerResponse: { id: 'fixture-email' } }
    if (result instanceof Error) throw result
    return { ok: true, status: 200, json: async () => result }
  } }
  return { bodies, options }
}
test('phone-only Property24 enquiry still emails the assigned agent', async () => {
  const fixture = deliveryFixture()
  const result = await sendPortalLeadNotifications(input, fixture.options)
  assert.equal(result.acknowledgement.reason, 'missing_lead_email')
  assert.equal(result.operations.sent, true)
  assert.equal(result.operations.providerMessageId, 'fixture-email')
  assert.equal(fixture.bodies.length, 1)
  assert.equal(fixture.bodies[0].to, 'agent@example.com')
  assert.equal(fixture.bodies[0].leadPhone, '0820000000')
  assert.equal(fixture.bodies[0].actionLink, 'https://app.arch9.co.za/pipeline/leads/lead-one')
  assert.doesNotMatch(fixture.bodies[0].message, /copied you|sent.*introduction/)
})
test('failed customer acknowledgement does not block the agent alert', async () => {
  const fixture = deliveryFixture([new Error('transport failed')])
  const result = await sendPortalLeadNotifications({ ...input, contact: { email: 'buyer@example.com' } }, fixture.options)
  assert.equal(result.acknowledgement.sent, false)
  assert.equal(result.operations.sent, true)
  assert.equal(fixture.bodies.length, 2)
})
test('suppressed email is not reported as sent', async () => {
  const fixture = deliveryFixture([{ ok: true, sent: false, suppressed: true, reason: 'disabled' }])
  const result = await sendPortalLeadNotifications(input, fixture.options)
  assert.deepEqual(result.operations, { sent: false, suppressed: true, reason: 'disabled', providerMessageId: null })
})
test('retries retain the same email key and missing configuration never calls a provider', async () => {
  const fixture = deliveryFixture()
  await sendPortalLeadNotifications(input, fixture.options)
  await sendPortalLeadNotifications(input, fixture.options)
  assert.equal(fixture.bodies[0].idempotencyKey, fixture.bodies[1].idempotencyKey)
  const result = await sendPortalLeadNotifications(input, { ...fixture.options, serviceRoleKey: '' })
  assert.equal(result.operations.reason, 'missing_email_configuration')
  assert.equal(fixture.bodies.length, 2)
})
test('missing listing email resolves the allocated agent within the same organisation', async () => {
  const filters = []
  const query = { select: () => query, eq: (key, value) => { filters.push([key, value]); return query }, in: () => query, limit: () => query, maybeSingle: async () => ({ data: { email: 'fresh@example.com', first_name: 'Fresh', last_name: 'Agent' }, error: null }) }
  const fixture = deliveryFixture()
  await sendPortalLeadNotifications({ ...input, listing: { ...input.listing, assigned_agent_email: '' }, client: { from: () => query } }, fixture.options)
  assert.deepEqual(filters, [['organisation_id', 'org-one'], ['user_id', 'agent-one']])
  assert.equal(fixture.bodies[0].to, 'fresh@example.com')
})
test('a rental enquiry opens the existing rental lead workspace', async () => {
  const fixture = deliveryFixture()
  await sendPortalLeadNotifications({ ...input, lead: { ...input.lead, raw_enquiry_payload: { classification: 'rental', arch9RentalLead: true } } }, fixture.options)
  assert.equal(fixture.bodies[0].actionLink, 'https://app.arch9.co.za/agent/rentals/pipeline/leads/lead-one')
})
