import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { NOTIFICATION_MODE } = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const { __notificationOutboxServiceTestUtils } = await server.ssrLoadModule('/src/services/notificationOutboxService.js')
  const { buildNotificationOutboxPayloads, mapOutboxEvent, summarizeNotificationOutbox } = __notificationOutboxServiceTestUtils
  const context = {
    organisationId: '11111111-1111-4111-8111-111111111111',
    listingId: '22222222-2222-4222-8222-222222222222',
    leadId: '33333333-3333-4333-8333-333333333333',
    recipientRole: 'seller',
    recipientName: 'TEST Seller',
    communicationType: 'seller_onboarding_link',
    subject: 'TEST — DO NOT ACTION',
    message: 'TEST — DO NOT ACTION',
    dedupeKey: 'test-seller-onboarding',
  }

  const emailItems = buildNotificationOutboxPayloads({
    ...context,
    notificationMode: NOTIFICATION_MODE.EMAIL,
    email: 'seller@example.com',
  })
  assert.equal(emailItems.length, 1)
  assert.equal(emailItems[0].channel, 'email')
  assert.equal(emailItems[0].status, 'queued')
  assert.equal(emailItems[0].dedupe_key, 'test-seller-onboarding:email')

  const multiChannelItems = buildNotificationOutboxPayloads({
    ...context,
    notificationMode: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP,
    email: 'seller@example.com',
    phone: '+27820000001',
  })
  assert.deepEqual(multiChannelItems.map((item) => item.channel), ['email', 'whatsapp'])
  assert.deepEqual(multiChannelItems.map((item) => item.status), ['queued', 'queued'])

  const handoffItems = buildNotificationOutboxPayloads({
    ...context,
    notificationMode: NOTIFICATION_MODE.AGENT_ASSISTED,
  })
  assert.equal(handoffItems.length, 1)
  assert.equal(handoffItems[0].channel, 'in_app')
  assert.equal(handoffItems[0].status, 'prepared')
  assert.equal(handoffItems[0].metadata_json.handoffRequired, true)

  assert.throws(
    () => buildNotificationOutboxPayloads({ ...context, notificationMode: NOTIFICATION_MODE.WHATSAPP }),
    /Add a mobile number/,
  )

  const summary = summarizeNotificationOutbox([
    mapOutboxEvent({ ...emailItems[0], id: 'one', created_at: '2026-07-19T10:00:00.000Z' }),
    mapOutboxEvent({ ...handoffItems[0], id: 'two', created_at: '2026-07-19T10:00:00.000Z' }),
    mapOutboxEvent({ ...emailItems[0], id: 'three', status: 'failed', created_at: '2026-07-19T10:00:00.000Z' }),
  ])
  assert.deepEqual(summary, { total: 3, prepared: 1, queued: 1, failed: 1, agentHandoffs: 1 })
} finally {
  await server.close()
}

console.log('notification outbox checks passed')
