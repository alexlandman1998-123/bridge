import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerDocumentReviewCommand } from '../src/services/sellerDocumentReviewWorkflowService.js'

const uploadedDocument = {
  id: 'document-1',
  requirement_id: 'requirement-1',
  status: 'uploaded',
  review_revision: 3,
}

const approval = buildSellerDocumentReviewCommand({ document: uploadedDocument, action: 'approve' })
assert.equal(approval.valid, true)
assert.equal(approval.expectedRevision, 3)
assert.equal(approval.documentId, 'document-1')

const startReview = buildSellerDocumentReviewCommand({ document: uploadedDocument, action: 'start review' })
assert.equal(startReview.valid, true)
assert.equal(startReview.action, 'start_review')

const vagueRejection = buildSellerDocumentReviewCommand({ document: uploadedDocument, action: 'reject', reason: 'bad' })
assert.equal(vagueRejection.valid, false)
assert.match(vagueRejection.errors.join(' '), /at least 5 characters/)

const clearRejection = buildSellerDocumentReviewCommand({
  document: uploadedDocument,
  action: 'reject',
  reason: 'The account number is cropped.',
})
assert.equal(clearRejection.valid, true)

const unlinked = buildSellerDocumentReviewCommand({
  document: { id: 'document-2', status: 'uploaded' },
  action: 'approve',
})
assert.equal(unlinked.valid, false)
assert.match(unlinked.errors.join(' '), /exact seller requirement/)

const alreadyApproved = buildSellerDocumentReviewCommand({
  document: { ...uploadedDocument, status: 'approved' },
  action: 'approve',
})
assert.equal(alreadyApproved.valid, false)

const migration = await readFile(
  new URL('../../supabase/migrations/202607170013_seller_document_review_workflow_p1_8.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'seller_document_review_events',
  'review_revision',
  'p_expected_revision',
  'for update',
  'A clear rejection reason of at least 5 characters is required',
  'The document must be linked to an exact seller requirement before review',
  'bridge_review_private_listing_seller_document_p1_8',
  'bridge_send_seller_document_manual_reminder_p1_8',
  'seller-document-manual-reminder:',
  'A seller upload already exists; review it instead of sending another reminder',
  'seller_document_review_outcome',
  'seller_document_review_queue_v1',
  'security_invoker = true',
  "'client_visible'",
  'is distinct from auth.uid()',
  'coalesce(public.bridge_is_org_admin',
]) {
  assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `P1-8 migration must include ${marker}`)
}

const agentListing = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(agentListing, /SellerDocumentReviewActions/)
assert.match(agentListing, /reviewSellerDocument/)
assert.match(agentListing, /sendSellerDocumentManualReminder/)
assert.doesNotMatch(agentListing, /document\?\.uploaded \|\|\s*\['uploaded'/)

const actionComponent = await readFile(new URL('../src/components/documents/SellerDocumentReviewActions.jsx', import.meta.url), 'utf8')
assert.match(actionComponent, /Reject and request replacement/)
assert.match(actionComponent, /This reason is shown to the seller and recorded in the audit trail/)
assert.match(actionComponent, /Send reminder/)

const privateListingService = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
assert.match(privateListingService, /review_revision, review_started_at, reviewed_at, reviewed_by, review_reason, rejection_reason/)

console.log('seller document review workflow P1-8 tests passed')
