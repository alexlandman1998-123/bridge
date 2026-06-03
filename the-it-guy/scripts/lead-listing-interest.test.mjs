import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationPath = '../../supabase/migrations/202606030002_lead_listing_interests.sql'
const migrationSql = await fs.readFile(new URL(migrationPath, import.meta.url), 'utf8')

assert.match(migrationSql, /create table if not exists public\.lead_listing_interests/i)
assert.match(migrationSql, /interest_id uuid primary key default gen_random_uuid\(\)/i)
assert.match(migrationSql, /lead_id uuid not null references public\.leads\(lead_id\)/i)
assert.match(migrationSql, /listing_id uuid not null references public\.private_listings\(id\)/i)
assert.match(migrationSql, /lead_listing_interests_lead_listing_unique_idx/i)
assert.match(migrationSql, /on public\.lead_listing_interests \(lead_id, listing_id\)/i)

for (const status of ['interested', 'suggested', 'shortlisted', 'sent', 'viewed', 'viewing_scheduled', 'dismissed', 'offer_submitted', 'converted']) {
  assert.match(migrationSql, new RegExp(`'${status}'`), `migration should allow ${status}`)
}

for (const indexName of [
  'lead_listing_interests_org_idx',
  'lead_listing_interests_lead_idx',
  'lead_listing_interests_listing_idx',
  'lead_listing_interests_contact_idx',
  'lead_listing_interests_status_idx',
  'lead_listing_interests_source_idx',
  'lead_listing_interests_created_idx',
]) {
  assert.match(migrationSql, new RegExp(indexName), `migration should include ${indexName}`)
}

assert.match(migrationSql, /alter table public\.lead_listing_interests enable row level security/i)
assert.match(migrationSql, /lead_listing_interests_select_member/i)
assert.match(migrationSql, /lead_listing_interests_insert_member/i)
assert.match(migrationSql, /lead_listing_interests_update_member/i)
assert.match(migrationSql, /lead_listing_interests_delete_member/i)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/i)
assert.match(migrationSql, /bridge_lead_listing_interest_scope_ok\(organisation_id, lead_id, listing_id, contact_id\)/i)

const pageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /Interested Listings/)
assert.match(pageSource, /Add Listing/)
assert.match(pageSource, /scheduleViewingFromLeadListingInterest/)

const listingSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(listingSource, /Interested Leads/)
assert.match(listingSource, /listListingLeadInterests/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadListingInterestServiceTestUtils } = await server.ssrLoadModule('/src/services/leadListingInterestService.js')
  const { buildLeadListingInterestPayload, mapLeadListingInterest } = __leadListingInterestServiceTestUtils
  const organisationId = '11111111-1111-4111-8111-111111111111'
  const leadId = '22222222-2222-4222-8222-222222222222'
  const contactId = '33333333-3333-4333-8333-333333333333'
  const listingId = '44444444-4444-4444-8444-444444444444'
  const actorId = '55555555-5555-4555-8555-555555555555'

  const payload = buildLeadListingInterestPayload({
    organisationId,
    lead: { leadId, contactId },
    contact: { contactId },
    listing: { id: listingId },
    source: 'manual',
    status: 'shortlisted',
    isAgentSelected: true,
    matchScore: 82,
    matchReasons: ['area', 'budget'],
    createdBy: actorId,
  })

  assert.equal(payload.organisation_id, organisationId)
  assert.equal(payload.lead_id, leadId)
  assert.equal(payload.contact_id, contactId)
  assert.equal(payload.listing_id, listingId)
  assert.equal(payload.status, 'shortlisted')
  assert.equal(payload.is_agent_selected, true)
  assert.equal(payload.match_score, 82)
  assert.deepEqual(payload.match_reasons, ['area', 'budget'])
  assert.equal(payload.created_by, actorId)

  const mapped = mapLeadListingInterest({
    interest_id: '66666666-6666-4666-8666-666666666666',
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: contactId,
    listing_id: listingId,
    source: 'manual',
    status: 'not-real',
    match_reasons: [{ reason: 'stored only' }],
    is_original_enquiry: true,
    sent_at: '2026-06-03T08:00:00.000Z',
  })

  assert.equal(mapped.status, 'interested', 'unknown statuses should fall back without hiding the record')
  assert.equal(mapped.isOriginalEnquiry, true)
  assert.equal(mapped.sentAt, '2026-06-03T08:00:00.000Z')
  assert.deepEqual(mapped.matchReasons, [{ reason: 'stored only' }])

  assert.throws(() => buildLeadListingInterestPayload({ organisationId, leadId }), /listing id/i)
} finally {
  await server.close()
}

console.log('lead listing interest tests passed')
