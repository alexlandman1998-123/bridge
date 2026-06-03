import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const serviceSource = await fs.readFile(new URL('../src/services/communicationDeliveryService.js', import.meta.url), 'utf8')
assert.match(serviceSource, /export async function unsubscribeLeadCommunications/)
assert.match(serviceSource, /Buyer Unsubscribed/)
assert.match(serviceSource, /propertyAlertsEnabled: false/)
assert.match(serviceSource, /emailEnabled: false/)
assert.match(serviceSource, /whatsappEnabled: false/)
assert.match(serviceSource, /Buyer has opted out of this communication channel\./)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { __communicationDeliveryServiceTestUtils } = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const { validateCommunicationPreferences } = __communicationDeliveryServiceTestUtils
  assert.deepEqual(validateCommunicationPreferences(null, { channel: 'email' }), {
    ok: false,
    reason: 'missing_consent',
    message: 'Buyer has opted out of this communication channel.',
  })
  assert.equal(validateCommunicationPreferences({ emailEnabled: false, whatsappEnabled: true, propertyAlertsEnabled: true }, { channel: 'email' }).reason, 'email_disabled')
  assert.equal(validateCommunicationPreferences({ emailEnabled: true, whatsappEnabled: false, propertyAlertsEnabled: true }, { channel: 'whatsapp' }).reason, 'whatsapp_disabled')
  assert.equal(validateCommunicationPreferences({ emailEnabled: true, whatsappEnabled: true, propertyAlertsEnabled: false }, { channel: 'email', communicationType: 'property_share' }).reason, 'property_alerts_disabled')
} finally {
  await server.close()
}

console.log('communication unsubscribe tests passed')
