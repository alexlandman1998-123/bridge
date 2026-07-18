import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerDocumentReviewSlaReport } from '../src/lib/sellerDocumentReviewSla.js'

const now = new Date('2026-07-17T12:00:00Z')
const row = (id, dueAt, extra = {}) => ({
  document_id: id,
  private_listing_id: 'listing-1',
  requirement_name: `Document ${id}`,
  status: 'uploaded',
  uploaded_at: '2026-07-16T12:00:00Z',
  review_due_at: dueAt,
  ...extra,
})

const report = buildSellerDocumentReviewSlaReport([
  row('on-track', '2026-07-19T12:00:00Z'),
  row('due-soon', '2026-07-18T06:00:00Z'),
  row('breached', '2026-07-17T10:00:00Z'),
  row('critical', '2026-07-15T10:00:00Z'),
  row('unassigned', '2026-07-19T12:00:00Z', { sla_state: 'unassigned' }),
  row('delivery-failed', '2026-07-19T12:00:00Z', { failed_notification_count: 1 }),
], { now })

assert.equal(report.version, 'seller_document_review_sla_p1_9_v1')
assert.equal(report.summary.openCount, 6)
assert.equal(report.summary.dueSoonCount, 1)
assert.equal(report.summary.breachedCount, 1)
assert.equal(report.summary.criticalCount, 1)
assert.equal(report.summary.unassignedCount, 1)
assert.equal(report.summary.failedNotificationCount, 1)
assert.equal(report.summary.blockingCount, 3)
assert.equal(report.gate.status, 'blocked')
assert.deepEqual(new Set(report.blockingDocumentIds), new Set(['critical', 'unassigned', 'delivery-failed']))

const healthy = buildSellerDocumentReviewSlaReport([row('healthy', '2026-07-20T12:00:00Z')], { now })
assert.equal(healthy.gate.status, 'pass')
assert.equal(healthy.gate.releaseRecommended, true)

const migration = await readFile(
  new URL('../../supabase/migrations/202607170014_seller_document_review_sla_p1_9.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'review_due_at',
  'review_sla_revision',
  'review_sla_level',
  "interval '48 hours'",
  "interval '24 hours'",
  'seller_document_review_sla_warning',
  'seller_document_review_sla_breach',
  'seller_document_review_sla_critical',
  'bridge_refresh_seller_document_review_sla_p1_9',
  'seller-document-review-sla:',
  'listing.assigned_agent_id is null',
  'bridge_resolve_seller_document_review_sla_p1_9',
  "event.status in ('prepared','queued')",
  'seller_document_review_sla_v1',
  'failed_notification_count',
  'security_invoker = true',
  'to service_role',
]) {
  assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `P1-9 migration must include ${marker}`)
}

const dispatcher = await readFile(
  new URL('../../supabase/functions/send-email/handlers/notificationReminderDispatch.ts', import.meta.url),
  'utf8',
)
assert.match(dispatcher, /bridge_refresh_seller_document_review_sla_p1_9/)
assert.match(dispatcher, /sellerDocumentReviewSla/)

const agentListing = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(agentListing, /buildSellerDocumentReviewSlaReport/)
assert.match(agentListing, /Review SLA/)
assert.match(agentListing, /Review due within 24 hours/)

const cli = await readFile(new URL('./audit-seller-document-review-sla.mjs', import.meta.url), 'utf8')
assert.match(cli, /--confirm-refresh/)
assert.match(cli, /--organisation-id=/)
assert.match(cli, /--listing-id=/)

console.log('seller document review SLA P1-9 tests passed')
