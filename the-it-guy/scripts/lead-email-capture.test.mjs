import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606290005_lead_email_capture_phase1.sql', import.meta.url), 'utf8')
const onboardingMigrationSql = await fs.readFile(new URL('../../supabase/migrations/202606290007_lead_capture_alias_onboarding_phase2.sql', import.meta.url), 'utf8')
const parserMigrationSql = await fs.readFile(new URL('../../supabase/migrations/202606290008_lead_capture_parser_phase3.sql', import.meta.url), 'utf8')
const reviewQueueMigrationSql = await fs.readFile(new URL('../../supabase/migrations/202606290009_lead_capture_review_queue_phase4a.sql', import.meta.url), 'utf8')
const repairWorkflowMigrationSql = await fs.readFile(new URL('../../supabase/migrations/202606290011_lead_capture_repair_workflow_phase4b.sql', import.meta.url), 'utf8')

for (const tableName of [
  'lead_capture_aliases',
  'inbound_lead_emails',
  'lead_parse_failures',
]) {
  assert.match(migrationSql, new RegExp(`create table if not exists public\\.${tableName}`, 'i'), `migration should create ${tableName}`)
  assert.match(migrationSql, new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'), `migration should enable RLS on ${tableName}`)
}

for (const field of [
  'agent_user_id uuid references public.profiles',
  'listing_id uuid references public.private_listings',
  'email_address text not null',
  'raw_payload jsonb not null default',
  'provider_message_id text',
  'lead_id uuid references public.leads',
  'contact_id uuid references public.contacts',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)'), 'i'), `migration should include ${field}`)
}

assert.match(migrationSql, /lead_capture_aliases_email_unique_idx/i)
assert.match(migrationSql, /inbound_lead_emails_provider_message_unique_idx/i)
assert.match(migrationSql, /bridge_create_lead_capture_alias/i)
assert.match(migrationSql, /bridge_normalize_lead_capture_email/i)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/i)
assert.match(migrationSql, /bridge_is_org_admin\(organisation_id\)/i)
assert.match(onboardingMigrationSql, /bridge_auto_create_agent_lead_capture_aliases/i)
assert.match(onboardingMigrationSql, /trg_bridge_auto_create_agent_lead_capture_aliases/i)
assert.match(onboardingMigrationSql, /after insert or update/i)
assert.match(onboardingMigrationSql, /phase2_backfill/i)
for (const source of ['General', 'Property24', 'Private Property', 'Website', 'Facebook']) {
  assert.match(onboardingMigrationSql, new RegExp(source), `onboarding migration should generate ${source} aliases`)
}
for (const field of ['parser_name', 'parse_confidence', 'parse_warnings', 'matched_fields']) {
  assert.match(parserMigrationSql, new RegExp(field), `parser migration should add ${field}`)
}
for (const field of ['review_status', 'reviewed_by', 'reviewed_at', 'resolved_at', 'ignored_at', 'review_note']) {
  assert.match(reviewQueueMigrationSql, new RegExp(field), `review queue migration should add ${field}`)
}
assert.match(reviewQueueMigrationSql, /inbound_lead_emails_review_queue_idx/)
assert.match(reviewQueueMigrationSql, /lead_parse_failures_review_queue_idx/)
for (const field of ['repaired_payload', 'repaired_by', 'repaired_at', 'lead_ingestion_log_id']) {
  assert.match(repairWorkflowMigrationSql, new RegExp(field), `repair workflow migration should add ${field}`)
}
assert.match(repairWorkflowMigrationSql, /inbound_lead_emails_repaired_idx/)
assert.match(repairWorkflowMigrationSql, /lead_parse_failures_repaired_idx/)

const serviceSource = await fs.readFile(new URL('../src/services/leadEmailCaptureService.js', import.meta.url), 'utf8')
for (const method of [
  'buildLeadCaptureStatusRows',
  'buildLeadCaptureReviewQueueRows',
  'buildLeadCaptureRepairDraft',
  'buildDefaultLeadCaptureAliasRequests',
  'buildLeadCaptureEmail',
  'createLeadCaptureAlias',
  'ensureLeadCaptureAliasesForUsers',
  'ensureDefaultLeadCaptureAliases',
  'findLeadCaptureAliasByEmail',
  'getLeadCaptureSetupStatus',
  'listInboundLeadEmails',
  'listLeadCaptureAliases',
  'listLeadParseFailures',
  'listLeadCaptureReviewQueue',
  'parseLeadEmailBySource',
  'parseInboundLeadEmail',
  'processInboundLeadEmail',
  'resolveLeadCaptureReviewItem',
  'ignoreLeadCaptureReviewItem',
  'repairLeadCaptureReviewItem',
  'linkLeadCaptureReviewItem',
]) {
  assert.match(serviceSource, new RegExp(`export .*${method}`), `service should export ${method}`)
}
assert.match(serviceSource, /bridge_create_lead_capture_alias/)
assert.match(serviceSource, /createOrUpdateLeadFromEnquiry/)
assert.match(serviceSource, /Property24/)
assert.match(serviceSource, /Private Property/)

const functionSource = await fs.readFile(new URL('../../supabase/functions/inbound-lead-email/index.ts', import.meta.url), 'utf8')
for (const copy of [
  'INBOUND_LEAD_EMAIL_WEBHOOK_SECRET',
  'lead_capture_aliases',
  'inbound_lead_emails',
  'lead_parse_failures',
  'lead_ingestion_logs',
  'contacts',
  'leads',
]) {
  assert.match(functionSource, new RegExp(copy), `edge function should reference ${copy}`)
}
assert.match(functionSource, /No active lead capture alias matched recipient/)
assert.match(functionSource, /Lead email capture needs a customer email or phone number/)
assert.match(functionSource, /property24_email/)
assert.match(functionSource, /private_property_email/)
assert.match(functionSource, /website_email/)
assert.match(functionSource, /parser_name/)
assert.match(functionSource, /parse_confidence/)
assert.match(functionSource, /matched_fields/)

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(appSource, /SettingsLeadCapturePage/)
assert.match(appSource, /path="lead-capture"/)

const settingsLayoutSource = await fs.readFile(new URL('../src/pages/settings/SettingsLayout.jsx', import.meta.url), 'utf8')
assert.match(settingsLayoutSource, /\/settings\/lead-capture/)
assert.match(settingsLayoutSource, /Lead Capture/)

const settingsLandingSource = await fs.readFile(new URL('../src/pages/settings/SettingsLanding.jsx', import.meta.url), 'utf8')
assert.match(settingsLandingSource, /\/settings\/lead-capture/)
assert.match(settingsLandingSource, /Manage forwarding addresses, agent activation, and inbound enquiry health/)

const leadCapturePageSource = await fs.readFile(new URL('../src/pages/settings/SettingsLeadCapturePage.jsx', import.meta.url), 'utf8')
for (const copy of [
  'Generate Agency Addresses',
  'Generate My Addresses',
  'Agency Activation',
  'Recent Inbound Emails',
  'Lead Capture Review Queue',
  'My Capture Addresses',
  'Lead Capture Repair',
  'Create Lead',
  'Link Existing Lead',
  'Repair',
  'Resolve',
  'Ignore',
]) {
  assert.match(leadCapturePageSource, new RegExp(copy), `lead capture page should render ${copy}`)
}
assert.match(leadCapturePageSource, /ensureLeadCaptureAliasesForUsers/)
assert.match(leadCapturePageSource, /buildLeadCaptureStatusRows/)
assert.match(leadCapturePageSource, /buildLeadCaptureReviewQueueRows/)
assert.match(leadCapturePageSource, /listInboundLeadEmails/)
assert.match(leadCapturePageSource, /listLeadParseFailures/)
assert.match(leadCapturePageSource, /resolveLeadCaptureReviewItem/)
assert.match(leadCapturePageSource, /ignoreLeadCaptureReviewItem/)
assert.match(leadCapturePageSource, /repairLeadCaptureReviewItem/)
assert.match(leadCapturePageSource, /linkLeadCaptureReviewItem/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadEmailCaptureServiceTestUtils } = await server.ssrLoadModule('/src/services/leadEmailCaptureService.js')
  const {
    buildDefaultLeadCaptureAliasRequests,
    buildLeadCaptureEmail,
    buildLeadCaptureAliasLocalPart,
    extractListingReference,
    getLeadCaptureSetupStatus,
    normalizeCaptureEmail,
    parseLeadEmailBySource,
    parseInboundLeadEmail,
    slugifyCapturePart,
    buildLeadCaptureReviewQueueRows,
    buildLeadCaptureRepairDraft,
    buildLeadCaptureStatusRows,
  } = __leadEmailCaptureServiceTestUtils

  const organisationId = '11111111-1111-4111-8111-111111111111'
  const agentUserId = '22222222-2222-4222-8222-222222222222'
  const aliasEmail = buildLeadCaptureEmail({
    organisationId,
    agentUserId,
    source: 'Property24',
    routingLevel: 'agent_source',
  })

  assert.match(aliasEmail, /^property24-[a-z0-9]+@leads\.arch9\.co\.za$/)
  assert.equal(
    buildLeadCaptureAliasLocalPart({ organisationId, agentUserId, source: 'Property24', routingLevel: 'agent_source' }),
    buildLeadCaptureAliasLocalPart({ organisationId, agentUserId, source: 'Property24', routingLevel: 'agent_source' }),
    'alias generation should be stable for the same route',
  )
  assert.equal(slugifyCapturePart('Private Property'), 'private-property')
  assert.equal(normalizeCaptureEmail('Mary <MARY-P24@Leads.Arch9.Co.Za>'), 'mary-p24@leads.arch9.co.za')

  const requests = buildDefaultLeadCaptureAliasRequests({
    organisationId,
    agentUserId,
    sources: ['General', 'Property24', 'Private Property', 'Website'],
  })
  assert.equal(requests.length, 4)
  assert.equal(requests[0].routingLevel, 'agent')
  assert.equal(requests[1].routingLevel, 'agent_source')
  assert.equal(requests[1].source, 'Property24')

  assert.equal(extractListingReference('Property24 Listing Ref: P24-98765'), 'P24-98765')

  const parsed = parseInboundLeadEmail({
    providerMessageId: 'msg-123',
    from: 'Property24 <noreply@property24.com>',
    fromName: 'Property24',
    subject: 'New Property24 enquiry - Listing Ref: P24-98765',
    textBody: `
      Name: Sarah Buyer
      Email: SARAH@example.test
      Phone: +27 82 000 0000
      Message: Please call me about this property.
    `,
  }, {
    organisationId,
    agentUserId,
    listingId: '33333333-3333-4333-8333-333333333333',
    source: 'Property24',
  })

  assert.equal(parsed.organisationId, organisationId)
  assert.equal(parsed.source, 'Property24')
  assert.equal(parsed.externalReference, 'msg-123')
  assert.equal(parsed.name, 'Sarah Buyer')
  assert.equal(parsed.email, 'sarah@example.test')
  assert.equal(parsed.phone, '+27820000000')
  assert.equal(parsed.listingReference, 'P24-98765')
  assert.equal(parsed.listingId, '33333333-3333-4333-8333-333333333333')
  assert.equal(parsed.assignedAgent.userId, agentUserId)
  assert.equal(parsed.rawPayload.parser.name, 'property24_email')
  assert.ok(parsed.rawPayload.parser.confidence >= 0.8)

  const privatePropertyParsed = parseInboundLeadEmail({
    providerMessageId: 'pp-msg-1',
    from: 'Private Property <leads@privateproperty.co.za>',
    subject: 'Private Property enquiry - Web Ref: PP-778899',
    textBody: `
      Contact Name: Peter Private
      Cellphone: 083 111 2222
      Email Address: peter@example.test
      Property Ref: PP-778899
      Enquiry: I would like to arrange a viewing.
    `,
  }, {
    organisationId,
    agentUserId,
    source: 'Private Property',
  })
  assert.equal(privatePropertyParsed.source, 'Private Property')
  assert.equal(privatePropertyParsed.name, 'Peter Private')
  assert.equal(privatePropertyParsed.email, 'peter@example.test')
  assert.equal(privatePropertyParsed.phone, '0831112222')
  assert.equal(privatePropertyParsed.listingReference, 'PP-778899')
  assert.equal(privatePropertyParsed.rawPayload.parser.name, 'private_property_email')
  assert.ok(privatePropertyParsed.rawPayload.parser.confidence >= 0.75)

  const websiteParsed = parseInboundLeadEmail({
    providerMessageId: 'web-msg-1',
    from: 'Website <forms@arch9.co.za>',
    subject: 'Website enquiry - Listing Reference: WEB-1234',
    textBody: `
      First Name: Wanda
      Last Name: Website
      Email: wanda@example.test
      Phone: 084 222 3333
      Area: Bedfordview
      Property Type: Apartment
      Budget: R 1 850 000
      Message: Please send me more information.
    `,
  }, {
    organisationId,
    agentUserId,
    source: 'Website',
  })
  assert.equal(websiteParsed.source, 'Website')
  assert.equal(websiteParsed.name, 'Wanda Website')
  assert.equal(websiteParsed.email, 'wanda@example.test')
  assert.equal(websiteParsed.phone, '0842223333')
  assert.equal(websiteParsed.listingReference, 'WEB-1234')
  assert.equal(websiteParsed.areaInterest, 'Bedfordview')
  assert.equal(websiteParsed.propertyType, 'Apartment')
  assert.equal(websiteParsed.budget, 1850000)
  assert.equal(websiteParsed.rawPayload.parser.name, 'website_email')
  assert.ok(websiteParsed.rawPayload.parser.confidence >= 0.8)

  const genericResult = parseLeadEmailBySource({
    alias: {},
    fromEmail: 'sender@example.test',
    fromName: 'Sender Name',
    subject: 'Manual forwarded enquiry',
    body: 'Please call me on 082 999 0000',
    source: 'Other',
    input: {},
  })
  assert.equal(genericResult.parserName, 'generic_email')
  assert.equal(genericResult.source, 'Other')
  assert.deepEqual(genericResult.warnings.includes('missing_listing_reference'), true)

  assert.equal(getLeadCaptureSetupStatus({ aliases: [] }), 'not_started')
  assert.equal(getLeadCaptureSetupStatus({ aliases: [{ status: 'active' }] }), 'addresses_generated')
  assert.equal(getLeadCaptureSetupStatus({ aliases: [{ status: 'active' }], lastInboundEmail: { emailId: 'email-1' } }), 'test_received')
  assert.equal(getLeadCaptureSetupStatus({ aliases: [{ status: 'active' }], lastInboundEmail: { emailId: 'email-1', leadId: 'lead-1' } }), 'active')

  const statusRows = buildLeadCaptureStatusRows({
    users: [{
      userId: agentUserId,
      fullName: 'Mary Agent',
      email: 'mary@example.test',
      role: 'agent',
    }],
    aliases: [{
      aliasId: 'alias-1',
      agentUserId,
      source: 'General',
      status: 'active',
      emailAddress: aliasEmail,
    }],
    inboundEmails: [{
      emailId: 'email-1',
      captureAliasId: 'alias-1',
      leadId: 'lead-1',
      receivedAt: '2026-06-29T10:00:00Z',
    }],
  })
  assert.equal(statusRows.length, 1)
  assert.equal(statusRows[0].name, 'Mary Agent')
  assert.equal(statusRows[0].status, 'active')
  assert.equal(statusRows[0].lastInboundEmail.emailId, 'email-1')

  const reviewRows = buildLeadCaptureReviewQueueRows({
    failures: [{
      failureId: 'failure-1',
      inboundEmailId: 'email-2',
      organisationId,
      source: 'Property24',
      reason: 'Lead email capture needs a customer email or phone number.',
      status: 'open',
      parserName: 'property24_email',
      parseConfidence: 0.42,
      parseWarnings: ['missing_contact_details'],
      payload: {
        matchedFields: {
          name: 'No Contact',
          listingReference: 'P24-123',
        },
      },
      createdAt: '2026-06-29T11:00:00Z',
    }],
    inboundEmails: [{
      emailId: 'email-2',
      organisationId,
      source: 'Property24',
      status: 'failed',
      parseConfidence: 0.42,
      receivedAt: '2026-06-29T11:00:00Z',
    }, {
      emailId: 'email-3',
      organisationId,
      source: 'Website',
      subject: 'Website enquiry',
      status: 'processed',
      parseConfidence: 0.5,
      matchedFields: { email: 'low@example.test' },
      receivedAt: '2026-06-29T12:00:00Z',
    }],
  })
  assert.equal(reviewRows.length, 2)
  assert.equal(reviewRows[0].kind, 'email')
  assert.equal(reviewRows[0].reason, 'Low parser confidence.')
  assert.equal(reviewRows[1].kind, 'failure')
  assert.equal(reviewRows[1].matchedFields.listingReference, 'P24-123')

  const repairDraft = buildLeadCaptureRepairDraft(reviewRows[1])
  assert.equal(repairDraft.organisationId, organisationId)
  assert.equal(repairDraft.source, 'Property24')
  assert.equal(repairDraft.name, 'No Contact')
  assert.equal(repairDraft.listingReference, 'P24-123')
} finally {
  await server.close()
}

console.log('lead email capture tests passed')
