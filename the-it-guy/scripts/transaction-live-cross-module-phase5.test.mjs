import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const hook = await readFile('src/hooks/useTransactionLiveRefresh.js', 'utf8')
const attorneyPage = await readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const unitPage = await readFile('src/pages/UnitDetail.jsx', 'utf8')
const clientPage = await readFile('src/pages/ClientPortal.jsx', 'utf8')
const deliveryPanel = await readFile('src/components/transaction/TransactionNotificationDeliveryPanel.jsx', 'utf8')
const progressService = await readFile('src/services/transactionSharedProgressService.js', 'utf8')
const readModelService = await readFile('src/services/transactionWorkflowReadModelService.js', 'utf8')
const clientWorkspaceService = await readFile('src/services/clientPortalWorkspaceService.js', 'utf8')

assert.match(hook, /table: 'transaction_shared_progress'/)
assert.match(hook, /filter: `transaction_id=eq\.\$\{normalizedTransactionId\}`/)
assert.match(hook, /table: 'notification_events'/)
assert.match(hook, /poll_interval/)
assert.match(hook, /visibility_restored/)
assert.match(hook, /removeChannel\(channel\)/)
assert.match(hook, /state\.active = false/)

for (const page of [attorneyPage, unitPage, clientPage]) {
  assert.match(page, /useTransactionLiveRefresh/)
  assert.match(page, /transactionId:/)
}
assert.match(attorneyPage, /TransactionNotificationDeliveryPanel/)
assert.match(attorneyPage, /resendTransactionProgressNotification/)
assert.match(attorneyPage, /notificationResendBusyId/)

assert.match(deliveryPanel, /Notification delivery/)
assert.match(deliveryPanel, /Resend email/)
assert.match(deliveryPanel, /WhatsApp is recorded/)
assert.match(deliveryPanel, /aria-live="polite"/)
assert.match(deliveryPanel, /aria-labelledby="notification-delivery-heading"/)

assert.match(progressService, /clientSafeSelection/)
assert.match(progressService, /\['buyer', 'seller', 'client'\]/)
assert.match(readModelService, /viewerRole: viewer\.viewerRole/)
assert.match(clientWorkspaceService, /viewerRole: clientRole/)
assert.match(clientWorkspaceService, /sharedProgressMilestones/)

console.log('Transaction progress Phase 5 live refresh, delivery controls, and client-safe projection checks passed.')
