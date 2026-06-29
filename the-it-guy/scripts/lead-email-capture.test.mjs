import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606290005_lead_email_capture_phase1.sql', import.meta.url), 'utf8')

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

const serviceSource = await fs.readFile(new URL('../src/services/leadEmailCaptureService.js', import.meta.url), 'utf8')
for (const method of [
  'buildDefaultLeadCaptureAliasRequests',
  'buildLeadCaptureEmail',
  'createLeadCaptureAlias',
  'ensureDefaultLeadCaptureAliases',
  'findLeadCaptureAliasByEmail',
  'listLeadCaptureAliases',
  'parseInboundLeadEmail',
  'processInboundLeadEmail',
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
    normalizeCaptureEmail,
    parseInboundLeadEmail,
    slugifyCapturePart,
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
} finally {
  await server.close()
}

console.log('lead email capture tests passed')
