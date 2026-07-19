import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { NOTIFICATION_MODE, resolveNotificationDispatchPlan } = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const { __notificationOutboxServiceTestUtils } = await server.ssrLoadModule('/src/services/notificationOutboxService.js')
  const { resolveOfferLinkDeliveryPlan } = await server.ssrLoadModule('/src/lib/offerLinkDeliveryPlan.js')

  const plan = resolveNotificationDispatchPlan({
    mode: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
    email: 'test.transfer.attorney@arch9.invalid',
    phone: '+27820000001',
    recipientName: 'TEST — DO NOT ACTION Transfer Attorney',
  })
  assert.equal(plan.suppressed, true)
  assert.equal(plan.autoDispatch, false)
  assert.deepEqual(plan.channels, [])

  const classifiedPlan = resolveNotificationDispatchPlan({
    mode: NOTIFICATION_MODE.EMAIL,
    email: 'recipient@example.com',
    recipientName: 'Pilot Recipient',
    metadata: { testDataProtection: { isTestData: true } },
  })
  assert.equal(classifiedPlan.suppressed, true)
  assert.equal(classifiedPlan.autoDispatch, false)

  const outbox = __notificationOutboxServiceTestUtils.buildNotificationOutboxPayloads({
    organisationId: '11111111-1111-4111-8111-111111111111',
    transactionId: '22222222-2222-4222-8222-222222222222',
    notificationMode: NOTIFICATION_MODE.EMAIL,
    recipientName: 'TEST — DO NOT ACTION Transfer Attorney',
    recipientRole: 'transfer_attorney',
    email: 'test.transfer.attorney@arch9.invalid',
    subject: 'TEST — DO NOT ACTION',
    message: 'Controlled transaction notification.',
    dedupeKey: 'controlled-test-role-notification',
  })
  assert.deepEqual(outbox.map((item) => `${item.channel}:${item.status}`), ['in_app:skipped'])
  assert.equal(outbox[0].metadata_json.notificationSuppressed, true)
  assert.equal(outbox[0].metadata_json.notificationSuppressionReason, 'controlled_test_recipient')

  const offerPlan = resolveOfferLinkDeliveryPlan({
    clientIntakePreference: 'digital_portal',
    notificationMode: NOTIFICATION_MODE.EMAIL,
    recipientName: 'TEST — DO NOT ACTION Buyer',
    email: 'test.buyer@arch9.invalid',
  })
  assert.equal(offerPlan.suppressed, true)
  assert.equal(offerPlan.deliversLink, false)

  const edge = fs.readFileSync('../supabase/functions/send-email/index.ts', 'utf8')
  const reminders = fs.readFileSync('../supabase/functions/send-email/handlers/notificationReminderDispatch.ts', 'utf8')
  assert.match(edge, /assessControlledTestRecipient/)
  assert.match(edge, /suppressed: true/)
  assert.match(reminders, /notificationSuppressionReason/)
  assert.match(reminders, /status: "skipped"/)
} finally {
  await server.close()
}

console.log('controlled-test-role-notification-guard: passed')
