import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030004_lead_ingestion_logs.sql', import.meta.url), 'utf8')
assert.match(migrationSql, /create table if not exists public\.lead_ingestion_logs/i)
for (const field of [
  'log_id uuid primary key default gen_random_uuid()',
  'organisation_id uuid not null references public.organisations(id)',
  'source text not null',
  'external_reference text',
  'payload jsonb not null default',
  'status text not null default',
  'lead_id uuid references public.leads(lead_id)',
  'contact_id uuid references public.contacts(contact_id)',
  'error text',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)')), `migration should include ${field}`)
}
for (const status of ['new', 'assigned', 'processed', 'duplicate', 'failed']) {
  assert.match(migrationSql, new RegExp(`'${status}'`), `migration should allow ${status}`)
}
for (const indexName of [
  'lead_ingestion_logs_org_idx',
  'lead_ingestion_logs_source_idx',
  'lead_ingestion_logs_external_reference_idx',
  'lead_ingestion_logs_status_idx',
  'lead_ingestion_logs_lead_idx',
  'lead_ingestion_logs_contact_idx',
  'lead_ingestion_logs_created_idx',
  'lead_ingestion_logs_source_external_reference_unique_idx',
]) {
  assert.match(migrationSql, new RegExp(indexName), `migration should include ${indexName}`)
}
assert.match(migrationSql, /alter table public\.lead_ingestion_logs enable row level security/i)
assert.match(migrationSql, /lead_ingestion_logs_select_member/i)
assert.match(migrationSql, /lead_ingestion_logs_insert_member/i)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/i)

const serviceSource = await fs.readFile(new URL('../src/services/leadIngestionService.js', import.meta.url), 'utf8')
for (const method of [
  'ingestProperty24Lead',
  'ingestPrivatePropertyLead',
  'ingestWebsiteLead',
  'ingestWhatsAppLead',
  'ingestReferralLead',
  'ingestGenericLead',
  'createOrUpdateLeadFromEnquiry',
]) {
  assert.match(serviceSource, new RegExp(`export .*${method}`), `service should export ${method}`)
}
assert.match(serviceSource, /findExistingContact/)
assert.match(serviceSource, /findExistingLead/)
assert.match(serviceSource, /createAgencyCrmLeadActivity/)
assert.match(serviceSource, /createAgencyCrmLeadTask/)
assert.match(serviceSource, /upsertLeadListingInterest/)
assert.match(serviceSource, /isOriginalEnquiry: true/)
assert.match(serviceSource, /status: 'interested'/)
assert.match(serviceSource, /createIngestionLog/)
assert.match(serviceSource, /Duplicate payload external reference/)
assert.match(serviceSource, /Unknown listing/)
assert.match(serviceSource, /assigned_agent_email/, 'buyer enquiry ingestion should read listing agent email for ownership display')
assert.match(serviceSource, /email: listingAgentEmail/, 'buyer enquiry ingestion should carry listing agent email into assignment payload')

const pageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /Enquiry History/)
assert.match(pageSource, /Original Source/)
assert.match(pageSource, /Latest Source/)
assert.match(pageSource, /Original Enquiry Listing/)
for (const copy of ['Create Lead', 'Buyer Lead', 'Seller Lead', 'Other Lead', 'Import Leads', 'Create Buyer Lead', 'Create Seller Lead']) {
  assert.match(pageSource, new RegExp(copy), `leads page should render ${copy}`)
}
for (const copy of ['Buyer / Requirement', 'Seller / Property', 'LeadViewSummary', 'Lead pipeline views']) {
  assert.match(pageSource, new RegExp(copy), `leads page should keep buyer/seller split view copy for ${copy}`)
}
for (const copy of ['Listing Journey', 'Readiness', 'Seller Actions', 'Seller leads progress toward a listing']) {
  assert.match(pageSource, new RegExp(copy), `seller leads workspace should render seller-specific workflow copy for ${copy}`)
}
for (const copy of ['Send Seller Onboarding', 'Generate Mandate', 'Seller onboarding must be submitted before generating a mandate']) {
  assert.match(pageSource, new RegExp(copy), `seller leads workspace should restore seller onboarding and mandate action copy for ${copy}`)
}
for (const copy of [
  'SellerLeadWorkspaceLayout',
  'SellerLeadHeader',
  'SellerAcquisitionActionRow',
  'SellerJourneyRail',
  'SellerOverviewTab',
  'SellerDocumentsSummaryCard',
  'SellerOwnershipSummaryCard',
  'SellerCommunicationCard',
  'SellerTimelinePanel',
  'Documents Complete',
  'Lead Age',
  'Mandate Status',
  'Listing Status',
  'Preferred Channel',
  'Email Alerts',
  'WhatsApp Alerts',
  'Last Contact',
]) {
  assert.match(pageSource, new RegExp(copy), `seller lead workspace consolidation should render ${copy}`)
}
assert.match(pageSource, /grid min-w-0 gap-5 lg:grid-cols-12/)
const sellerDetailsSource = pageSource.slice(pageSource.indexOf('function SellerDetailsCard'), pageSource.indexOf('function SellerDocumentsSummaryCard'))
assert.doesNotMatch(sellerDetailsSource, /Legacy Budget|Area Interest|Property Interest|Property Alerts|Saved Searches/)
const sellerCommunicationSource = pageSource.slice(pageSource.indexOf('function SellerCommunicationCard'), pageSource.indexOf('function SellerTimelinePanel'))
assert.doesNotMatch(sellerCommunicationSource, /Property Alerts|Buyer Preferences|Saved Searches/)
assert.match(pageSource, /CreateLeadDropdown/)
assert.match(pageSource, /LeadCreateModal/)
assert.match(pageSource, /sendSellerOnboarding/)
assert.match(pageSource, /sellerOnboardingIsSubmitted/)
assert.match(pageSource, /\/pipeline\/leads\/\$\{row\.leadId\}\/legal\/mandate\?mode=\$\{mandateMeta\.mode\}&returnTo=\$\{returnTo\}/)
assert.match(pageSource, /buildSellerJourney/)
assert.match(pageSource, /buildSellerReadinessSummary/)
assert.match(pageSource, /activeTab === 'property_match'/)
assert.match(pageSource, /activeTab === 'offers'/)
assert.match(pageSource, /normalizeCanonicalLeadCategory\(createCategory, 'other'\)/)
assert.match(pageSource, /leadCategory: category/)
assert.match(pageSource, /sellerPropertyAddress: category === 'seller'/)
assert.match(pageSource, /budget: category === 'buyer'/)
assert.doesNotMatch(pageSource, /<th[^>]*>\s*Next Action\s*<\/th>/)
assert.equal(pageSource.includes('navigate(`/pipeline/leads/${createdLead.leadId}`)'), true)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadIngestionServiceTestUtils } = await server.ssrLoadModule('/src/services/leadIngestionService.js')
  const {
    buildRequirementPayload,
    isActiveLead,
    normalizeEnquiryPayload,
    normalizeLeadSource,
    normalizePhone,
  } = __leadIngestionServiceTestUtils

  assert.equal(normalizeLeadSource('property24'), 'Property24')
  assert.equal(normalizeLeadSource('PrivateProperty'), 'Private Property')
  assert.equal(normalizeLeadSource('manual import'), 'Manual Import')
  assert.equal(normalizeLeadSource('mystery'), 'Other')
  assert.equal(normalizePhone('+27 82 000 0000'), '+27820000000')
  assert.equal(normalizePhone('082 000 0000'), '0820000000')

  const enquiry = normalizeEnquiryPayload({
    organisationId: '11111111-1111-4111-8111-111111111111',
    source: 'Property24',
    enquiryId: 'p24-123',
    name: 'Sarah Jones',
    phone: '+27 82 000 0000',
    email: 'SARAH@example.test',
    message: 'Please call me about this listing.',
    listingReference: 'B9-123',
    budgetMax: 2200000,
    area: 'Bartlett',
    propertyType: 'Townhouse',
  })

  assert.equal(enquiry.source, 'Property24')
  assert.equal(enquiry.externalReference, 'p24-123')
  assert.equal(enquiry.contact.firstName, 'Sarah')
  assert.equal(enquiry.contact.lastName, 'Jones')
  assert.equal(enquiry.contact.email, 'sarah@example.test')
  assert.equal(enquiry.contact.phone, '+27820000000')
  assert.equal(enquiry.contact.hasIdentity, true)
  assert.equal(enquiry.listingReference, 'B9-123')

  const invalid = normalizeEnquiryPayload({ organisationId: enquiry.organisationId, source: 'Website' })
  assert.equal(invalid.contact.hasIdentity, false, 'empty payload should be flagged for failed handling')

  assert.equal(isActiveLead({ status: 'New Lead' }), true)
  assert.equal(isActiveLead({ status: 'Converted to Transaction' }), false)
  assert.equal(isActiveLead({ stage: 'Lost' }), false)

  const requirement = buildRequirementPayload(
    enquiry,
    { leadId: '22222222-2222-4222-8222-222222222222', contactId: '33333333-3333-4333-8333-333333333333' },
    [],
  )
  assert.equal(requirement.leadId, '22222222-2222-4222-8222-222222222222')
  assert.equal(requirement.contactId, '33333333-3333-4333-8333-333333333333')
  assert.equal(requirement.title, 'Property24 enquiry requirement')
  assert.equal(requirement.budgetMax, 2200000)
  assert.equal(requirement.areas, 'Bartlett')
  assert.equal(requirement.propertyTypes, 'Townhouse')
  assert.equal(requirement.isPrimary, true)

  const noDuplicateRequirement = buildRequirementPayload(enquiry, { leadId: requirement.leadId, contactId: requirement.contactId }, [{ status: 'active' }])
  assert.equal(noDuplicateRequirement, null, 'active requirements should be reused instead of duplicated')
} finally {
  await server.close()
}

console.log('lead ingestion tests passed')
