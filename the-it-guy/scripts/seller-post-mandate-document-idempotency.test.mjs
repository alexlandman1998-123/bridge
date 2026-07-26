import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildSellerPostMandateDocumentOrchestrationPlan,
  buildSellerPostMandateDocumentPackFingerprint,
  buildSellerPostMandateDocumentWorkflowRunDedupeKey,
  orchestrateSellerPostMandateDocumentRequest,
} from '../src/services/sellerPostMandateDocumentOrchestrationService.js'

function requirement(overrides = {}) {
  return {
    id: overrides.id || `req-${overrides.requirement_key || 'id_document'}`,
    requirement_key: 'id_document',
    requirement_name: 'ID Document',
    requirement_description: 'Identity document for seller FICA.',
    requirement_group: 'seller_identity',
    document_visibility: 'seller_visible',
    status: 'required',
    is_required: true,
    ...overrides,
  }
}

const baseContext = {
  listing: {
    id: 'listing-1',
    organisationId: 'org-1',
    mandateStatus: 'signed',
    sellerOnboarding: {
      status: 'completed',
      token: 'stable-seller-token',
      formData: {
        email: 'seller@example.com',
        sellerFirstName: 'Sam',
        sellerSurname: 'Seller',
      },
    },
  },
  mandatePacket: { id: 'packet-1', status: 'completed' },
  requirements: [
    requirement({ requirement_key: 'id_document', requirement_name: 'ID Document' }),
    requirement({ requirement_key: 'proof_of_address', requirement_name: 'Proof of Address' }),
  ],
  documents: [],
}

const reorderedContext = {
  ...baseContext,
  requirements: [...baseContext.requirements].reverse(),
}

const companyContext = {
  ...baseContext,
  listing: {
    ...baseContext.listing,
    sellerOnboarding: {
      ...baseContext.listing.sellerOnboarding,
      formData: {
        email: 'company@example.com',
        ownershipType: 'company',
        companyName: 'Example Property Pty Ltd',
        companyRegistrationNumber: '2020/123456/07',
        companyRegisteredAddress: '1 Example Road',
        authorisedSignatoryName: 'Casey Director',
      },
    },
  },
  requirements: [
    requirement({ id: 'company-resolution-id', requirement_key: 'company_resolution_to_sell', requirement_name: 'Company Resolution' }),
  ],
}

const basePlan = buildSellerPostMandateDocumentOrchestrationPlan(baseContext)
const reorderedPlan = buildSellerPostMandateDocumentOrchestrationPlan(reorderedContext)
const companyPlan = buildSellerPostMandateDocumentOrchestrationPlan(companyContext)

assert.equal(basePlan.documentPackFingerprint, reorderedPlan.documentPackFingerprint, 'requirement order must not change the workflow fingerprint')
assert.notEqual(basePlan.documentPackFingerprint, companyPlan.documentPackFingerprint, 'seller structure changes must produce a new fingerprint')
assert.equal(
  basePlan.workflowRunDedupeKey,
  buildSellerPostMandateDocumentWorkflowRunDedupeKey({
    listingId: basePlan.evaluation.listingId,
    mandatePacketId: basePlan.evaluation.mandatePacketId,
    documentPackFingerprint: basePlan.documentPackFingerprint,
  }),
)
assert.equal(basePlan.notificationPayload.dedupeKey, basePlan.workflowRunDedupeKey)
assert.equal(basePlan.emailPayload.workflowDedupeKey, basePlan.workflowRunDedupeKey)
assert.equal(basePlan.emailPayload.documentPackFingerprint, basePlan.documentPackFingerprint)
assert.equal(
  buildSellerPostMandateDocumentPackFingerprint({
    sellerStructure: basePlan.structureRequirementPack.sellerStructure,
    outstandingDocuments: [...basePlan.evaluation.outstandingDocuments].reverse(),
    documentPackSource: basePlan.structureRequirementPack.source,
  }),
  basePlan.documentPackFingerprint,
  'fingerprint helper should be stable for document order changes',
)

let sideEffectRan = false
let seenDuplicateCheck = null
const duplicate = await orchestrateSellerPostMandateDocumentRequest({
  context: baseContext,
  hasAlreadyCompleted: async ({ documentPackFingerprint, workflowRunDedupeKey }) => {
    seenDuplicateCheck = { documentPackFingerprint, workflowRunDedupeKey }
    return true
  },
  issueRequests: async () => {
    sideEffectRan = true
  },
  sendEmail: async () => {
    sideEffectRan = true
  },
  createNotification: async () => {
    sideEffectRan = true
  },
})
assert.equal(duplicate.skipped, true)
assert.equal(duplicate.reason, 'already_completed')
assert.equal(sideEffectRan, false)
assert.deepEqual(seenDuplicateCheck, {
  documentPackFingerprint: basePlan.documentPackFingerprint,
  workflowRunDedupeKey: basePlan.workflowRunDedupeKey,
})

const service = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)
assert.match(service, /select\('id, event_payload_json'\)/, 'mandate invite dedupe should read event payload fingerprints.')
assert.match(service, /existingFingerprint === fingerprint/, 'mandate invite dedupe should compare document pack fingerprints.')
assert.match(service, /existingRunKey === runKey/, 'mandate invite dedupe should compare workflow run keys.')
assert.match(service, /if \(!existingFingerprint && !existingRunKey\) return true/, 'legacy sent events should remain suppressive.')

console.log('seller post-mandate document idempotency tests passed')
