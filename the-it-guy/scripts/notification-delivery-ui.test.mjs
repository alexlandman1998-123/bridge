import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const appRoot = new URL('../', import.meta.url)
const listingDetailSource = await fs.readFile(new URL('src/pages/AgentListingDetail.jsx', appRoot), 'utf8')
const outboxSource = await fs.readFile(new URL('src/services/notificationOutboxService.js', appRoot), 'utf8')

assert.match(listingDetailSource, /Notification delivery/, 'seller workspace must show the selected notification delivery mode')
assert.match(listingDetailSource, /Seller delivery mode/, 'seller workspace must offer an explicit delivery mode control')
assert.match(listingDetailSource, /NOTIFICATION_MODE_OPTIONS.map/, 'delivery mode control must use the shared notification-mode choices')
assert.match(listingDetailSource, /prepareNotificationOutbox\(/, 'seller onboarding must prepare a durable outbox item before delivery')
assert.match(listingDetailSource, /selectedNotificationPlan\.handoffRequired/, 'agent-assisted delivery must avoid automatic external sending')
assert.match(listingDetailSource, /updateNotificationOutboxStatus/, 'seller onboarding must record sent or failed outbox results')
assert.match(listingDetailSource, /No pending seller notifications/, 'seller workspace must make an empty outbox explicit')
assert.match(outboxSource, /export async function updateNotificationOutboxStatus/, 'outbox service must support recording delivery outcomes')

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { __notificationOutboxServiceTestUtils } = await server.ssrLoadModule('/src/services/notificationOutboxService.js')
  assert.equal(__notificationOutboxServiceTestUtils.normalizeStatus('sent'), 'sent')
  assert.equal(__notificationOutboxServiceTestUtils.normalizeStatus('unexpected'), 'prepared')
} finally {
  await server.close()
}

console.log('notification delivery UI checks passed')
