import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030011_communication_delivery_preferences.sql', import.meta.url), 'utf8')

assert.match(migrationSql, /create table if not exists public\.communication_deliveries/i)
for (const field of [
  'id uuid primary key',
  'organisation_id uuid not null references public.organisations',
  'branch_id uuid references public.organisation_branches',
  'lead_id uuid not null references public.leads',
  'listing_id uuid references public.private_listings',
  'communication_type text not null',
  'channel text not null',
  'recipient text not null',
  'subject text',
  'message_preview text',
  'status text not null default',
  'provider text not null default',
  'provider_message_id text',
  'error_message text',
  'prepared_by uuid',
  'sent_by uuid',
  'prepared_at timestamptz',
  'sent_at timestamptz',
  'delivered_at timestamptz',
  'failed_at timestamptz',
]) {
  assert.match(migrationSql, new RegExp(field), `migration should include ${field}`)
}
for (const value of ['prepared', 'queued', 'sent', 'delivered', 'failed', 'sendgrid', 'mailgun', 'twilio', 'meta', 'internal', 'email', 'whatsapp']) {
  assert.match(migrationSql, new RegExp(`'${value}'`), `migration should include ${value}`)
}
assert.match(migrationSql, /communication_deliveries_select_member/)
assert.match(migrationSql, /communication_deliveries_insert_member/)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/)
assert.match(migrationSql, /bridge_can_access_workspace_record\(organisation_id, branch_id/)

const serviceSource = await fs.readFile(new URL('../src/services/communicationDeliveryService.js', import.meta.url), 'utf8')
for (const method of [
  'createCommunicationDelivery',
  'prepareCommunicationDelivery',
  'queueCommunicationDelivery',
  'markCommunicationDeliverySent',
  'markCommunicationDeliveryDelivered',
  'markCommunicationDeliveryFailed',
  'listCommunicationDeliveries',
]) {
  assert.match(serviceSource, new RegExp(`export (async )?function ${method}`), `service should export ${method}`)
}
assert.doesNotMatch(serviceSource, /setInterval|cron|campaign|drip|bulk|newsletter|auto follow/i)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { __communicationDeliveryServiceTestUtils } = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const { buildCommunicationDeliveryPayload, normalizeCommunicationDelivery } = __communicationDeliveryServiceTestUtils
  const payload = buildCommunicationDeliveryPayload({
    organisationId: '11111111-1111-4111-8111-111111111111',
    branchId: '66666666-6666-4666-8666-666666666666',
    leadId: '22222222-2222-4222-8222-222222222222',
    listingId: '33333333-3333-4333-8333-333333333333',
    communicationType: 'property_share',
    channel: 'Email',
    recipient: 'buyer@example.com',
    subject: 'Listing',
    message: 'A long but manual message approved by the agent.',
    provider: 'sendgrid',
    status: 'sent',
    sentBy: '44444444-4444-4444-8444-444444444444',
  })
  assert.equal(payload.status, 'sent')
  assert.equal(payload.channel, 'email')
  assert.equal(payload.provider, 'sendgrid')
  assert.equal(payload.branch_id, '66666666-6666-4666-8666-666666666666')
  assert.equal(payload.recipient, 'buyer@example.com')
  assert.equal(payload.listing_id, '33333333-3333-4333-8333-333333333333')

  const normalized = normalizeCommunicationDelivery({
    id: '55555555-5555-4555-8555-555555555555',
    organisation_id: payload.organisation_id,
    lead_id: payload.lead_id,
    listing_id: payload.listing_id,
    communication_type: 'property_share',
    channel: 'whatsapp',
    recipient: '+27820000000',
    status: 'delivered',
    provider: 'twilio',
  })
  assert.equal(normalized.status, 'delivered')
  assert.equal(normalized.channel, 'whatsapp')
  assert.equal(normalized.provider, 'twilio')
} finally {
  await server.close()
}

console.log('communication delivery tests passed')
