import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030011_communication_delivery_preferences.sql', import.meta.url), 'utf8')

assert.match(migrationSql, /create table if not exists public\.lead_communication_preferences/i)
for (const field of [
  'lead_id uuid primary key',
  'email_enabled boolean not null default true',
  'whatsapp_enabled boolean not null default false',
  'marketing_opt_in boolean not null default false',
  'property_alerts_enabled boolean not null default true',
  "preferred_channel text not null default 'email'",
  "frequency text not null default 'immediate'",
  'unsubscribe_token text not null',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)')), `migration should include ${field}`)
}
for (const value of ['immediate', 'daily', 'weekly', 'monthly']) {
  assert.match(migrationSql, new RegExp(`'${value}'`), `migration should include ${value}`)
}

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { __communicationDeliveryServiceTestUtils } = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const {
    buildDefaultLeadCommunicationPreferences,
    normalizeLeadCommunicationPreferences,
    validateCommunicationPreferences,
  } = __communicationDeliveryServiceTestUtils
  const prefs = buildDefaultLeadCommunicationPreferences({
    organisationId: '11111111-1111-4111-8111-111111111111',
    leadId: '22222222-2222-4222-8222-222222222222',
  })
  assert.equal(prefs.emailEnabled, true)
  assert.equal(prefs.whatsappEnabled, false)
  assert.equal(prefs.propertyAlertsEnabled, true)
  assert.equal(prefs.preferredChannel, 'email')
  assert.equal(prefs.frequency, 'immediate')
  assert.equal(validateCommunicationPreferences(prefs, { channel: 'email', communicationType: 'property_share' }).ok, true)
  assert.equal(validateCommunicationPreferences(prefs, { channel: 'whatsapp' }).ok, false)

  const normalized = normalizeLeadCommunicationPreferences({
    lead_id: prefs.leadId,
    organisation_id: prefs.organisationId,
    email_enabled: false,
    whatsapp_enabled: true,
    property_alerts_enabled: false,
    preferred_channel: 'whatsapp',
    frequency: 'monthly',
  })
  assert.equal(normalized.preferredChannel, 'whatsapp')
  assert.equal(normalized.frequency, 'monthly')
  assert.equal(validateCommunicationPreferences(normalized, { channel: 'email' }).message, 'Buyer has opted out of this communication channel.')
} finally {
  await server.close()
}

console.log('communication preferences tests passed')
