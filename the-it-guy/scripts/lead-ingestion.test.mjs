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
const connectorSource = await fs.readFile(new URL('../src/services/leadSourceConnectorService.js', import.meta.url), 'utf8')
const leadImportModalSource = await fs.readFile(new URL('../src/components/leads/LeadImportModal.jsx', import.meta.url), 'utf8')
const csvImportSource = await fs.readFile(new URL('../src/lib/csvImport.js', import.meta.url), 'utf8')
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
assert.match(serviceSource, /createAgencyIntroducedDeveloperLead/)
assert.match(serviceSource, /resolveDevelopmentInterest/)
assert.match(serviceSource, /scoreDevelopmentTextMatch/)
assert.match(serviceSource, /lead-ingestion-development-mirror-v1/)
assert.match(serviceSource, /Development lead mirrored/)
assert.match(serviceSource, /sourceLeadId: lead\.leadId/)
assert.match(serviceSource, /isOriginalEnquiry: true/)
assert.match(serviceSource, /status: 'interested'/)
assert.match(serviceSource, /createIngestionLog/)
assert.match(serviceSource, /Duplicate payload external reference/)
assert.match(serviceSource, /Unknown listing/)
assert.match(serviceSource, /assigned_agent_email/, 'buyer enquiry ingestion should read listing agent email for ownership display')
assert.match(serviceSource, /email: listingAgentEmail/, 'buyer enquiry ingestion should carry listing agent email into assignment payload')

const agentLeadsPageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(agentLeadsPageSource, /AgencyPipelinePage/)
assert.match(agentLeadsPageSource, /initialViewMode="leads"/)

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
for (const copy of ['Buyer Lead', 'Buyer Leads', 'Seller Leads', 'Buyer Qualification', 'What’s next', 'Viewing Planner']) {
  assert.match(pageSource, new RegExp(copy), `shared leads workspace should render ${copy}`)
}
assert.match(pageSource, /selectedLeadEnquiryPropertyContext/, 'buyer overview should build property enquiry context')
assert.match(pageSource, /Property enquiry/, 'buyer overview should show the property the buyer enquired on')
assert.match(pageSource, /handleLinkBuyerEnquiryListing/, 'buyer overview should let agents link an enquiry to a listing')
assert.match(pageSource, /updateAgencyCrmLeadRecord\(organisationId, selectedLeadRecordId, leadPatch\)/, 'linking should persist listingId to the lead')
assert.match(pageSource, /<ListingPicker[\s\S]*label="Link to listing"/, 'buyer overview should expose a listing picker for enquiry linking')
assert.match(pageSource, /data-testid="simplified-viewing-planner"/, 'buyer overview should keep the viewing planner below the enquiry link block')
assert.match(pageSource, /sendSellerOnboarding/)
assert.match(pageSource, /buildSellerJourney/)
assert.match(pageSource, /buildSellerReadinessSummary/)
assert.match(pageSource, /sellerPropertyAddress: normalizeText\(leadForm\.sellerPropertyAddress/)
assert.doesNotMatch(pageSource, /<th[^>]*>\s*Next Action\s*<\/th>/)

const enquiriesPageSource = await fs.readFile(new URL('../src/pages/AgentEnquiriesPage.jsx', import.meta.url), 'utf8')
assert.match(enquiriesPageSource, /searchParams\.get\('leadCategory'\)/, 'enquiries page should read leadCategory import intent')
assert.match(enquiriesPageSource, /lockImportRowCategory/, 'bulk upload should lock rows to the requested buyer or seller import category')
assert.match(enquiriesPageSource, /Import \$\{lockedLeadCategoryLabel\} Leads/, 'bulk upload modal should show the selected buyer or seller import mode')
assert.match(enquiriesPageSource, /from '..\/lib\/csvImport'/, 'enquiries bulk upload should use the shared CSV parser and field lookup')
assert.match(leadImportModalSource, /from '..\/..\/lib\/csvImport'/, 'lead bulk upload modal should use the shared CSV parser and field lookup')
assert.match(connectorSource, /pickImportValue/, 'manual lead import mapping should use normalized CSV field lookup for every imported field')
assert.match(csvImportSource, /const delimiterCandidates = \[',', ';', '\\t'\]/, 'shared CSV import should support Excel comma, semicolon and tab-delimited files')
assert.match(csvImportSource, /\.replace\(\/\[\^a-z0-9\]\/g, ''\)/, 'shared CSV import should match header variants across spaces, underscores and punctuation')

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
    scoreDevelopmentTextMatch,
    scoreListingTextMatch,
  } = __leadIngestionServiceTestUtils

  assert.equal(normalizeLeadSource('property24'), 'Property24')
  assert.equal(normalizeLeadSource('PrivateProperty'), 'Private Property')
  assert.equal(normalizeLeadSource('show day'), 'Show Day')
  assert.equal(normalizeLeadSource('open house'), 'Show Day')
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

  const showDayEnquiry = normalizeEnquiryPayload({
    organisationId: enquiry.organisationId,
    source: 'showday',
    name: 'Sipho Visitor',
    phone: '082 111 2222',
    listingId: '44444444-4444-4444-8444-444444444444',
  })
  assert.equal(showDayEnquiry.source, 'Show Day')
  assert.equal(showDayEnquiry.lead.leadCategory, 'buyer')

  const listingTextMatchScore = scoreListingTextMatch(
    {
      title: '12 Oak Avenue',
      address_line_1: '12 Oak Avenue',
      suburb: 'Bedfordview',
      city: 'Johannesburg',
    },
    {
      lead: {
        enquiredPropertyTitle: '12 Oak Avenue',
        enquiredPropertyAddress: '12 Oak Avenue, Bedfordview',
        propertyInterest: '',
      },
      raw: {},
    },
  )
  assert.ok(listingTextMatchScore >= 0.72, 'listing title/address should match Mailgun property text')
  assert.equal(
    scoreListingTextMatch(
      { title: '99 Different Road', address_line_1: '99 Different Road', suburb: 'Sandton' },
      { lead: { enquiredPropertyTitle: '12 Oak Avenue', enquiredPropertyAddress: '12 Oak Avenue, Bedfordview' }, raw: {} },
    ),
    0,
    'unrelated listing text should not match',
  )

  const developmentTextMatchScore = scoreDevelopmentTextMatch(
    {
      name: 'Amari Residences',
      location: 'Pomona, Kempton Park',
      developer_company: 'Amari Developments',
    },
    {
      developmentName: '',
      lead: {
        enquiredPropertyTitle: '3 Bedroom Apartment at Amari Residences',
        enquiredPropertyAddress: 'Pomona, Kempton Park',
        propertyInterest: 'Apartment',
      },
      raw: {},
    },
  )
  assert.ok(developmentTextMatchScore >= 0.8, 'development name/title text should mirror a buyer lead into the development lane')
  assert.equal(
    scoreDevelopmentTextMatch(
      { name: 'Amari Residences', location: 'Pomona, Kempton Park' },
      { lead: { enquiredPropertyTitle: 'Standalone house in Sandton', enquiredPropertyAddress: 'Sandton' }, raw: {} },
    ),
    0,
    'unrelated development text should not create a mirror',
  )

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
