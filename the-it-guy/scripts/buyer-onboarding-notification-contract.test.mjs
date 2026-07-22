import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const notificationOutbox = await server.ssrLoadModule('/src/services/notificationOutboxService.js')
  const communicationDelivery = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const buyerOnboarding = await server.ssrLoadModule('/src/services/buyerOnboardingNotificationService.js')
  const { buildNotificationOutboxPayloads } = notificationOutbox
  const { NOTIFICATION_MODE } = communicationDelivery
  const { resolveBuyerOnboardingNotificationMode } = buyerOnboarding

  assert.equal(resolveBuyerOnboardingNotificationMode({ clientIntakePreference: 'digital_portal' }), NOTIFICATION_MODE.EMAIL)
  assert.equal(resolveBuyerOnboardingNotificationMode({ clientIntakePreference: 'agent_assisted' }), NOTIFICATION_MODE.AGENT_ASSISTED)
  assert.equal(resolveBuyerOnboardingNotificationMode({ clientIntakePreference: 'hard_copy' }), NOTIFICATION_MODE.AGENT_ASSISTED)

  const context = {
    organisationId: '11111111-1111-4111-8111-111111111111',
    transactionId: '22222222-2222-4222-8222-222222222222',
    leadId: '33333333-3333-4333-8333-333333333333',
    communicationType: 'client_onboarding',
    subject: 'Buyer onboarding',
    message: 'Complete onboarding.',
    dedupeKey: 'buyer-onboarding:test',
  }

  const testPayload = buildNotificationOutboxPayloads({
    ...context,
    notificationMode: NOTIFICATION_MODE.EMAIL,
    recipientName: 'TEST — DO NOT ACTION Buyer',
    email: 'test.buyer@arch9.invalid',
  })
  assert.equal(testPayload.length, 1)
  assert.equal(testPayload[0].status, 'skipped')
  assert.equal(testPayload[0].metadata_json.notificationSuppressed, true)

  const assistedPayload = buildNotificationOutboxPayloads({
    ...context,
    notificationMode: NOTIFICATION_MODE.AGENT_ASSISTED,
    recipientName: 'Pilot Buyer',
    email: 'buyer@example.test',
  })
  assert.equal(assistedPayload.length, 1)
  assert.equal(assistedPayload[0].channel, 'in_app')
  assert.equal(assistedPayload[0].status, 'prepared')
  assert.equal(assistedPayload[0].metadata_json.handoffRequired, true)

  console.log('Buyer onboarding notification contract checks passed.')
} finally {
  await server.close()
}
