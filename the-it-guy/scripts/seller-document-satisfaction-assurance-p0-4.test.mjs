import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getListingReadinessSummary } from '../src/lib/sellerDocumentRequirementEngine.js'
import {
  assertSellerUploadTarget,
  buildSellerDocumentAssuranceReport,
  documentExactlyMatchesSellerRequirement,
  resolveExactSellerRequirement,
} from '../src/services/sellerDocumentSatisfactionAssuranceService.js'

const requirement = {
  id: 'requirement-levy',
  private_listing_id: 'listing-1',
  requirement_key: 'levy_statement',
  requirement_name: 'Latest Levy Statement',
  status: 'requested',
  is_required: true,
  document_visibility: 'seller_visible',
}

const uploaded = {
  id: 'document-uploaded',
  private_listing_id: 'listing-1',
  requirement_id: 'requirement-levy',
  document_type: 'levy_statement',
  status: 'uploaded',
}
const approved = { ...uploaded, id: 'document-approved', status: 'approved' }

assert.equal(documentExactlyMatchesSellerRequirement(uploaded, requirement), true)
assert.equal(documentExactlyMatchesSellerRequirement({ ...uploaded, requirement_id: 'another-requirement' }, requirement), false)
assert.equal(documentExactlyMatchesSellerRequirement({ document_type: 'levy', status: 'approved' }, requirement), false)
assert.equal(resolveExactSellerRequirement({ requirements: [requirement], requirementKey: 'Levy Statement' })?.id, requirement.id)
assert.equal(resolveExactSellerRequirement({ requirements: [requirement], requirementKey: 'levy' }), null)

const receivedReport = buildSellerDocumentAssuranceReport({ requirements: [requirement], documents: [uploaded] })
assert.equal(receivedReport.ready, false)
assert.equal(receivedReport.receivedCount, 1)
assert.equal(receivedReport.satisfiedCount, 0)
assert.equal(receivedReport.missingCount, 1)

const approvedReport = buildSellerDocumentAssuranceReport({ requirements: [requirement], documents: [approved] })
assert.equal(approvedReport.ready, true)
assert.equal(approvedReport.satisfiedCount, 1)

const falseCompletion = buildSellerDocumentAssuranceReport({
  requirements: [{ ...requirement, status: 'approved' }],
  documents: [],
})
assert.equal(falseCompletion.ready, false)
assert.equal(falseCompletion.falseCompletions.length, 1)
const verifiedCanonicalCompletion = buildSellerDocumentAssuranceReport({
  requirements: [{ ...requirement, status: 'approved', satisfied_by_document_id: 'canonical-document-1' }],
  documents: [],
})
assert.equal(verifiedCanonicalCompletion.ready, true)

const readiness = getListingReadinessSummary({
  sellerOnboardingStatus: 'completed',
  mandateStatus: 'signed',
  documentRequirements: [requirement],
  documents: [uploaded],
})
assert.equal(readiness.completedRequirementsCount, 0)
assert.equal(readiness.receivedRequirementsCount, 1)
assert.equal(readiness.pendingReviewRequirementsCount, 1)

assert.doesNotThrow(() => assertSellerUploadTarget({
  listingId: 'listing-1',
  requirement,
  requirementKey: 'levy_statement',
}))
assert.throws(() => assertSellerUploadTarget({
  listingId: 'listing-1',
  requirement,
  requirementKey: 'rates_statement',
}), /does not match/)
assert.throws(() => assertSellerUploadTarget({
  listingId: 'listing-1',
  requirement: { ...requirement, private_listing_id: 'listing-2' },
  requirementKey: 'levy_statement',
}), /another listing/)
assert.throws(() => assertSellerUploadTarget({
  listingId: 'listing-1',
  requirement,
  requirementKey: 'levy_statement',
  canonicalRequirementInstanceId: 'canonical-1',
  canonicalRequirement: {
    id: 'canonical-1',
    context_type: 'private_listing',
    context_id: 'listing-2',
    document_definition_key: 'levy_statement',
    uploadable_by_roles: ['seller'],
  },
}), /another listing/)

const migration = await readFile(
  new URL('../../supabase/migrations/202607170010_seller_document_satisfaction_assurance_p0_4.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'bridge_validate_private_listing_document_link_p0_4',
  'bridge_sync_private_listing_requirement_assurance_p0_4',
  'bridge_prevent_false_requirement_completion_p0_4',
  'bridge_private_listing_seller_document_assurance_p0_4',
  'satisfied_by_document_id',
  'received_pending_approval',
  'approved_exact_requirement_link',
  'Canonical and seller document requirements do not match.',
]) {
  assert.ok(migration.includes(marker), `P0-4 migration must include ${marker}`)
}

const privateListingService = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)
assert.match(privateListingService, /assertSellerUploadTarget/)
assert.match(privateListingService, /buildSellerDocumentAssuranceReport/)
assert.match(privateListingService, /must be approved before/)
assert.doesNotMatch(privateListingService, /canonical seller upload link skipped/)

console.log('seller document satisfaction assurance P0-4 tests passed')
