import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import process from 'node:process'
import { createServer } from 'vite'

const jsonOutput = process.argv.includes('--json')
const appRoot = new URL('../', import.meta.url)
const report = {
  scope: 'notification-smoke',
  mode: 'safe-static',
  generatedAt: new Date().toISOString(),
  checks: [],
}

function check(name, run) {
  try {
    run()
    report.checks.push({ name, status: 'PASS' })
  } catch (error) {
    report.checks.push({ name, status: 'FAIL', detail: error?.message || String(error) })
  }
}

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { NOTIFICATION_MODE } = await server.ssrLoadModule('/src/services/communicationDeliveryService.js')
  const { __notificationOutboxServiceTestUtils } = await server.ssrLoadModule('/src/services/notificationOutboxService.js')
  const { buildNotificationOutboxPayloads } = __notificationOutboxServiceTestUtils
  const base = {
    organisationId: '11111111-1111-4111-8111-111111111111',
    leadId: '22222222-2222-4222-8222-222222222222',
    listingId: '33333333-3333-4333-8333-333333333333',
    communicationType: 'TEST — DO NOT ACTION',
    subject: 'TEST — DO NOT ACTION',
    message: 'TEST — DO NOT ACTION',
    email: 'notification-smoke@example.test',
    phone: '+27820000001',
    dedupeKey: 'notification-smoke',
  }

  check('email mode queues one email only', () => {
    const rows = buildNotificationOutboxPayloads({ ...base, notificationMode: NOTIFICATION_MODE.EMAIL })
    assert.deepEqual(rows.map((row) => `${row.channel}:${row.status}`), ['email:queued'])
  })
  check('WhatsApp mode queues one WhatsApp only', () => {
    const rows = buildNotificationOutboxPayloads({ ...base, notificationMode: NOTIFICATION_MODE.WHATSAPP })
    assert.deepEqual(rows.map((row) => `${row.channel}:${row.status}`), ['whatsapp:queued'])
  })
  check('dual mode queues both channels with separate dedupe keys', () => {
    const rows = buildNotificationOutboxPayloads({ ...base, notificationMode: NOTIFICATION_MODE.EMAIL_AND_WHATSAPP })
    assert.deepEqual(rows.map((row) => row.channel), ['email', 'whatsapp'])
    assert.equal(new Set(rows.map((row) => row.dedupe_key)).size, 2)
  })
  check('agent-assisted mode creates a prepared in-app handoff and no external channel', () => {
    const rows = buildNotificationOutboxPayloads({ ...base, notificationMode: NOTIFICATION_MODE.AGENT_ASSISTED })
    assert.deepEqual(rows.map((row) => `${row.channel}:${row.status}`), ['in_app:prepared'])
    assert.equal(rows[0].metadata_json.handoffRequired, true)
  })
  check('missing selected contact channel blocks preparation', () => {
    assert.throws(
      () => buildNotificationOutboxPayloads({ ...base, notificationMode: NOTIFICATION_MODE.WHATSAPP, phone: '' }),
      /Add a mobile number/,
    )
  })
} finally {
  await server.close()
}

const [listingDetail, outboxService, migration] = await Promise.all([
  fs.readFile(new URL('src/pages/AgentListingDetail.jsx', appRoot), 'utf8'),
  fs.readFile(new URL('src/services/notificationOutboxService.js', appRoot), 'utf8'),
  fs.readFile(new URL('../../supabase/migrations/202607050009_notification_automation_foundation.sql', import.meta.url), 'utf8'),
])

check('seller workspace exposes delivery choice and visible outbox state', () => {
  assert.match(listingDetail, /Seller delivery mode/)
  assert.match(listingDetail, /prepareNotificationOutbox\(/)
  assert.match(listingDetail, /No pending seller notifications/)
})
check('outbox records provider outcomes instead of leaving jobs silently queued', () => {
  assert.match(outboxService, /updateNotificationOutboxStatus/)
  assert.match(listingDetail, /updateOutboxItem\('email', 'sent'/)
  assert.match(listingDetail, /updateOutboxItem\('whatsapp', 'failed'/)
})
check('notification outbox schema supports queued external and in-app handoff events', () => {
  assert.match(migration, /create table if not exists public\.notification_events/i)
  assert.match(migration, /channel in \('email', 'in_app', 'whatsapp', 'sms'\)/i)
  assert.match(migration, /status in \('prepared', 'queued', 'sent', 'delivered', 'failed', 'skipped'\)/i)
})

const failed = report.checks.filter((item) => item.status === 'FAIL')
report.summary = {
  status: failed.length ? 'FAILED' : 'READY',
  passCount: report.checks.length - failed.length,
  failedCount: failed.length,
  note: 'No provider, browser, or staging request was made by this smoke suite.',
}

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  report.checks.forEach((item) => {
    process.stdout.write(`${item.status}  ${item.name}${item.detail ? ` — ${item.detail}` : ''}\n`)
  })
  process.stdout.write(`Notification smoke: ${report.summary.status} (${report.summary.passCount}/${report.checks.length} checks).\n`)
}

if (failed.length) process.exitCode = 1
