import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildSellerDocumentFollowUpDedupeKey,
  buildSellerDocumentFollowUpPlan,
  isSellerDocumentRequestSatisfied,
} from '../src/services/sellerDocumentRequestFollowUpService.js'
import {
  buildSellerDocumentRequestPlan,
} from '../src/services/sellerDocumentRequestOrchestrationService.js'
import {
  getNotificationAutomationDefinition,
  resolveNotificationAutomationKey,
} from '../src/services/notificationAutomationContract.js'

const listing = { id: 'listing-1', seller: { email: 'seller@example.com' } }
const requirement = {
  id: 'requirement-1',
  private_listing_id: 'listing-1',
  requirement_key: 'levy_statement',
  requirement_name: 'Latest Levy Statement',
  status: 'requested',
  is_required: true,
  document_visibility: 'seller_visible',
  requested_at: '2026-07-01T08:00:00.000Z',
  request_revision: 1,
}

assert.equal(
  buildSellerDocumentFollowUpDedupeKey({ listingId: 'listing-1', requirementId: 'requirement-1', revision: 2, day: 5 }),
  'seller-document-follow-up:listing-1:requirement-1:v2:day-5',
)

const dayFivePlan = buildSellerDocumentFollowUpPlan({
  listing,
  requirements: [requirement],
  now: new Date('2026-07-06T08:00:00.000Z'),
})
assert.deepEqual(dayFivePlan.reminders.map((item) => item.reminderDay), [0, 2, 5])
assert.equal(dayFivePlan.escalations.length, 0)

const dedupedPlan = buildSellerDocumentFollowUpPlan({
  listing,
  requirements: [requirement],
  now: new Date('2026-07-06T08:00:00.000Z'),
  existingDedupeKeys: dayFivePlan.reminders.map((item) => item.dedupeKey),
})
assert.equal(dedupedPlan.reminders.length, 0)

const dayNinePlan = buildSellerDocumentFollowUpPlan({
  listing,
  requirements: [requirement],
  now: new Date('2026-07-10T08:00:00.000Z'),
})
assert.deepEqual(dayNinePlan.reminders.map((item) => item.reminderDay), [0, 2, 5, 9])
assert.equal(dayNinePlan.escalations.length, 1)

const suppliedDocument = {
  requirement_id: 'requirement-1',
  document_type: 'levy_statement',
  status: 'uploaded',
}
assert.equal(isSellerDocumentRequestSatisfied(requirement, [suppliedDocument]), true)
const stoppedPlan = buildSellerDocumentFollowUpPlan({
  listing,
  requirements: [requirement],
  documents: [suppliedDocument],
  now: new Date('2026-07-10T08:00:00.000Z'),
})
assert.equal(stoppedPlan.reminders.length, 0)
assert.equal(stoppedPlan.escalations.length, 0)
assert.equal(stoppedPlan.stopped[0].reason, 'document_supplied')

const rejectedRequirement = {
  ...requirement,
  status: 'rejected',
  request_dedupe_key: 'seller-document-request:listing-1:levy_statement:v1',
}
const reuploadPlan = buildSellerDocumentRequestPlan({ listing, requirements: [rejectedRequirement] })
assert.equal(reuploadPlan.issued.length, 1)
assert.equal(reuploadPlan.issued[0].isReupload, true)
assert.equal(reuploadPlan.issued[0].requestRevision, 2)
assert.equal(reuploadPlan.issued[0].requestDedupeKey, 'seller-document-request:listing-1:levy_statement:v2')

const reissuedRequirement = {
  ...rejectedRequirement,
  request_revision: 2,
  request_dedupe_key: 'seller-document-request:listing-1:levy_statement:v2',
  last_request_reason: 'rejected_document_reupload_required',
}
const stableReuploadPlan = buildSellerDocumentRequestPlan({ listing, requirements: [reissuedRequirement] })
assert.equal(stableReuploadPlan.issued.length, 0)
assert.equal(stableReuploadPlan.existing.length, 1)
assert.equal(stableReuploadPlan.existing[0].requestRevision, 2)

const reminderDefinition = getNotificationAutomationDefinition('seller_document_request_reminder')
assert.equal(reminderDefinition?.implementationStatus, 'active')
assert.deepEqual(reminderDefinition?.reminderPolicy?.cadenceDays, [0, 2, 5, 9])
assert.equal(
  resolveNotificationAutomationKey({ communicationType: 'seller_document_request_reminder' }),
  'seller_document_request_reminder',
)

const migration = await readFile(
  new URL('../../supabase/migrations/202607170008_seller_document_delivery_follow_up_p0_3.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'seller_document_request_reminder',
  'seller_document_request_escalation',
  'bridge_queue_seller_document_follow_ups_p0_3',
  'bridge_prepare_rejected_seller_document_reupload_p0_3',
  'bridge_stop_seller_document_follow_up_from_upload_p0_3',
  "(values (0), (2), (5), (9))",
  "status in ('requested', 'rejected')",
  "status = 'skipped'",
  'seller-document-follow-up:',
]) {
  assert.ok(migration.includes(marker), `P0-3 migration must include ${marker}`)
}

const dispatcher = await readFile(
  new URL('../../supabase/functions/send-email/handlers/notificationReminderDispatch.ts', import.meta.url),
  'utf8',
)
assert.match(dispatcher, /seller_document_request_reminder/)
assert.match(dispatcher, /Replace Document/)
assert.match(dispatcher, /document_request_no_longer_open/)
assert.match(dispatcher, /bridge_queue_seller_document_follow_ups_p0_3/)

console.log('seller document delivery and follow-up P0-3 tests passed')
