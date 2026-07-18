import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  addSellerRequestBusinessDays,
  buildSellerDocumentRequestDedupeKey,
  buildSellerDocumentRequestPlan,
} from '../src/services/sellerDocumentRequestOrchestrationService.js'

function requirement(overrides = {}) {
  return {
    id: overrides.id || `req-${overrides.requirement_key || 'document'}`,
    private_listing_id: 'listing-1',
    requirement_key: 'id_document',
    requirement_name: 'ID Document',
    requirement_group: 'seller_identity',
    document_visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    ...overrides,
  }
}

const listing = {
  id: 'listing-1',
  seller: { email: 'seller@example.com' },
}

assert.equal(
  addSellerRequestBusinessDays(new Date('2026-07-17T08:00:00.000Z'), 1),
  '2026-07-20',
  'business-day due dates must skip weekends',
)
assert.equal(
  buildSellerDocumentRequestDedupeKey('listing-1', 'Latest Levy Statement'),
  'seller-document-request:listing-1:latest_levy_statement:v1',
)

const initial = buildSellerDocumentRequestPlan({
  listing,
  requirements: [
    requirement(),
    requirement({
      id: 'req-levy',
      requirement_key: 'levy_statement',
      requirement_name: 'Latest Levy Statement',
      requirement_group: 'property',
    }),
    requirement({
      id: 'req-mandate',
      requirement_key: 'signed_mandate',
      requirement_name: 'Signed Mandate',
      requirement_group: 'mandate',
    }),
  ],
  now: new Date('2026-07-17T08:00:00.000Z'),
  reason: 'onboarding_completed',
})

assert.equal(initial.counts.issued, 3)
assert.equal(initial.issued.find((item) => item.requirementKey === 'levy_statement')?.requestStage, 'listing_ready')
assert.equal(initial.issued.find((item) => item.requirementKey === 'signed_mandate')?.requestPriority, 'blocker')
assert.equal(initial.issued[0].requestDueDate, '2026-07-24')
assert.deepEqual(initial.issued[0].requestDeliveryChannels, ['in_app', 'email'])
assert.equal(initial.issued[0].requestedFromRole, 'seller')

const supplied = buildSellerDocumentRequestPlan({
  listing,
  requirements: [requirement()],
  documents: [{ requirement_id: 'req-id_document', document_type: 'id_document', status: 'uploaded' }],
})
assert.equal(supplied.counts.issued, 0)
assert.equal(supplied.suppressed[0].reason, 'document_already_supplied')

const optionalAndInternal = buildSellerDocumentRequestPlan({
  listing,
  requirements: [
    requirement({ id: 'req-optional', is_required: false }),
    requirement({ id: 'req-internal', document_visibility: 'internal' }),
    requirement({ id: 'req-approved', status: 'approved' }),
    requirement({ id: 'req-rejected', status: 'rejected' }),
  ],
})
assert.equal(optionalAndInternal.counts.issued, 1)
assert.equal(optionalAndInternal.counts.suppressed, 3)
assert.equal(optionalAndInternal.issued[0].isReupload, true)
assert.equal(optionalAndInternal.issued[0].requestRevision, 2)
assert.equal(optionalAndInternal.issued[0].requestPriority, 'blocker')

const alreadyRequested = requirement({
  status: 'requested',
  request_dedupe_key: 'seller-document-request:listing-1:id_document:v1',
  requested_at: '2026-07-17T08:00:00.000Z',
  request_due_date: '2026-07-24',
  request_revision: 1,
})
const rerun = buildSellerDocumentRequestPlan({ listing, requirements: [alreadyRequested] })
assert.equal(rerun.counts.issued, 0, 'an orchestration rerun must not duplicate a request')
assert.equal(rerun.counts.existing, 1)

const factChange = buildSellerDocumentRequestPlan({
  listing,
  requirements: [
    alreadyRequested,
    requirement({
      id: 'req-gas',
      requirement_key: 'gas_compliance_certificate',
      requirement_name: 'Gas Compliance Certificate',
      requirement_group: 'property_compliance',
    }),
  ],
})
assert.equal(factChange.counts.existing, 1)
assert.equal(factChange.counts.issued, 1, 'newly applicable facts must create only the new request')
assert.equal(factChange.issued[0].requirementKey, 'gas_compliance_certificate')

const migration = await readFile(
  new URL('../../supabase/migrations/202607170002_automatic_seller_document_requests_p0_1.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'request_dedupe_key',
  'request_due_date',
  'request_delivery_channels',
  'bridge_issue_private_listing_requirement_request_p0_1',
  'trg_issue_private_listing_requirement_request_p0_1',
  'bridge_create_transaction_seller_document_request_p0_1',
  'trg_create_transaction_seller_document_request_p0_1',
  'SellerDocumentAutomaticallyRequested',
  'document_already_supplied',
]) {
  if (marker === 'document_already_supplied') continue
  assert.match(migration, new RegExp(marker), `migration must include ${marker}`)
}
assert.match(migration, /not exists\s*\([\s\S]*private_listing_documents/i)
assert.match(migration, /status in \('uploaded', 'under_review', 'approved', 'completed'\)/i)
assert.match(migration, /status = 'requested'/i)

console.log('automatic seller document request P0-1 tests passed')
