import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPrivatePropertyClient } from '../server/services/privatePropertyClient.js'
import { parsePrivatePropertyLeads, runPrivatePropertyLeadSync } from '../server/services/privatePropertyLeadSyncService.js'
import handler from '../api/cron/private-property-leads.js'

const config = { id: 'config', organisation_id: 'agency', branch_guid: 'branch', environment: 'production', enabled: true, status: 'approved', go_live_approved_at: '2026-09-01', base_url: 'https://services.privateproperty.co.za/AgentImport/AgentImport.asmx' }
const row = ({ id = 'lead', branch = 'BRANCH', ref = 'T1', date = '2026-10-22T10:00:00', ...rest } = {}) => `<ListingLeadDetail><LeadId>${id}</LeadId><BranchId>${branch}</BranchId><PPRef>${ref}</PPRef><UniqueListingId>external</UniqueListingId><Date>${date}</Date><FromName>Fixture &amp; Person</FromName><FromEmail>fixture@example.test</FromEmail><LeadType>WhatsAppLead</LeadType><Message>Enquiry</Message>${rest.extra || ''}</ListingLeadDetail>`
const xml = (rows) => `<ListingLeadDetailsFeedResult><ListingLeadDetails>${rows.join('')}</ListingLeadDetails></ListingLeadDetailsFeedResult>`
function fixture({ pages = [[row()], []], duplicate = false, mappings, ingestFails = false, configs = [config] } = {}) {
  const calls = [], writes = []
  const client = {
    from(table) {
      const q = { select() { return q }, eq() { return q }, in() { return q }, order() { return q }, range() { return q }, limit() { return q },
        then(resolve) { return Promise.resolve({ data: table === 'private_property_agency_configs' ? configs : table === 'private_property_listing_syncs' ? mappings || [{ private_listing_id: 'listing', property_id: 'external', private_property_ref: 'T1', listing_type: 'Sale' }] : duplicate ? [{ lead_id: 'existing' }] : [], error: null }).then(resolve) } }
      return q
    },
    async rpc(name, args) {
      if (name === 'get_private_property_agency_credentials') return { data: [{ username: 'fixture-user', password: 'fixture-password' }] }
      writes.push(args); return ingestFails ? { error: new Error('private contact data must never appear in reports') } : { data: 'created' }
    },
  }
  const createPortal = () => ({ async getListingLeadDetailsFeed(args) { calls.push(args); const rows = pages[calls.length - 1] || []; return { data: xml(rows), summary: { continuationKey: `cursor-${calls.length}` } } } })
  return { client, createPortal, calls, writes, now: new Date('2026-10-22T12:00:00Z') }
}

test('SOAP lead operation follows the live supplier contract and signs the request', async () => {
  let body
  const portal = createPrivatePropertyClient({ username: 'fixture', password: 'secret', fetchImpl: async (_, args) => { body = args.body; return { ok: true, status: 200, text: async () => xml([]) } } })
  await portal.getListingLeadDetailsFeed({ startDate: '2026-09-15T00:00:00Z', continuationKey: 'next&cursor' })
  assert.match(body, /<ListingLeadDetailsFeed xmlns=/)
  assert.match(body, /<StartDate>2026-09-15T00:00:00.000Z<\/StartDate>/)
  assert.match(body, /<ContinuationKey>next&amp;cursor<\/ContinuationKey>/)
  assert.match(body, /<Digest>/); assert.doesNotMatch(body, /secret/)
})
test('parser preserves enquiries and interprets local dates consistently', () => {
  const [lead] = parsePrivatePropertyLeads(xml([row()]))
  assert.equal(lead.name, 'Fixture & Person'); assert.equal(lead.date, '2026-10-22T10:00:00+02:00')
  assert.equal(parsePrivatePropertyLeads(xml([row({ date: '2026-10-22T10:00:00Z' })]))[0].date, '2026-10-22T10:00:00Z')
  assert.throws(() => parsePrivatePropertyLeads('<Unrelated/>'), /response_invalid/)
  assert.throws(() => parsePrivatePropertyLeads(xml([row({ id: '' })])), /identity_invalid/)
  assert.throws(() => parsePrivatePropertyLeads(xml([row({ date: '' })])), /identity_invalid/)
})
test('dry run follows all pages, scopes the shared credential feed by branch, and writes nothing', async () => {
  const f = fixture({ pages: [[row(), row({ id: 'foreign', branch: 'another-agency' })], [row({ id: 'second' })], []] })
  const result = await runPrivatePropertyLeadSync(f)
  assert.equal(result.status, 'COMPLETE'); assert.equal(result.reports[0].eligible, 2)
  assert.equal(result.reports[0].otherBranch, 1); assert.equal(f.calls[1].continuationKey, 'cursor-1'); assert.equal(f.writes.length, 0)
})
test('apply uses the atomic deduplicating RPC, preserves listing assignment, and silences historical introductions', async () => {
  const f = fixture({ pages: [[row({ date: '2026-10-01T10:00:00', ref: 'RR1' })], []], mappings: [{ private_listing_id: 'rental', property_id: 'external', private_property_ref: 'RR1', listing_type: 'Rental' }] })
  const result = await runPrivatePropertyLeadSync({ ...f, apply: true })
  assert.equal(result.reports[0].imported, 1)
  assert.equal(f.writes[0].p_listing_id, 'rental'); assert.equal(f.writes[0].p_external_reference, 'PP:lead')
  assert.equal(f.writes[0].p_raw_payload.arch9NotificationHistorical, true); assert.equal(f.writes[0].p_raw_payload.role, 'tenant')
  const duplicate = fixture({ duplicate: true }); await runPrivatePropertyLeadSync({ ...duplicate, apply: true }); assert.equal(duplicate.writes.length, 0)
})
test('truncated and cyclic feeds fail visibly before any import', async () => {
  const f = fixture({ pages: [[row()]] })
  const result = await runPrivatePropertyLeadSync({ ...f, apply: true, maxPages: 1 })
  assert.equal(result.status, 'ATTENTION_REQUIRED'); assert.equal(f.writes.length, 0)
  const cycle = fixture(); cycle.createPortal = () => ({ async getListingLeadDetailsFeed() { return { data: xml([row()]), summary: { continuationKey: '0' } } } })
  assert.equal((await runPrivatePropertyLeadSync(cycle)).reports[0].error, 'private_property_lead_cursor_repeated')
})
test('unrelated hosts and conflicting mappings fail closed; errors contain no contact details', async () => {
  const bad = fixture({ configs: [{ ...config, base_url: 'https://untrusted.example' }] })
  assert.equal((await runPrivatePropertyLeadSync(bad)).reports[0].error, 'private_property_lead_host_invalid'); assert.equal(bad.calls.length, 0)
  const ambiguous = fixture({ mappings: [{ private_listing_id: 'one', property_id: 'external' }, { private_listing_id: 'two', private_property_ref: 'T1' }] })
  assert.equal((await runPrivatePropertyLeadSync({ ...ambiguous, apply: true })).reports[0].error, 'private_property_lead_listing_ambiguous'); assert.equal(ambiguous.writes.length, 0)
  const failed = await runPrivatePropertyLeadSync({ ...fixture({ ingestFails: true }), apply: true })
  assert.equal(failed.status, 'ATTENTION_REQUIRED'); assert.doesNotMatch(JSON.stringify(failed), /private contact data/)
})
test('scheduled import refuses unauthenticated requests before accessing storage', async () => {
  const response = { setHeader() {}, end(value) { this.body = JSON.parse(value) } }
  await handler({ method: 'GET', headers: {} }, response)
  assert.equal(response.statusCode, 401)
  await handler({ method: 'POST', headers: {} }, response)
  assert.equal(response.statusCode, 405)
})
