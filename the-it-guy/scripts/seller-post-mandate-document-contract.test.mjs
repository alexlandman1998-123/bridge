import assert from 'node:assert/strict'
import {
  SELLER_POST_MANDATE_DOCUMENT_REASON,
  SELLER_POST_MANDATE_DOCUMENT_WORKFLOW,
  evaluateSellerPostMandateDocumentWorkflow,
  getSellerPostMandateOutstandingDocuments,
  isSellerPostMandateMandateSigned,
} from '../src/services/sellerPostMandateDocumentContract.js'

function requirement(overrides = {}) {
  return {
    id: overrides.id || `req-${overrides.requirement_key || 'id_document'}`,
    requirement_key: 'id_document',
    requirement_name: 'ID Document',
    requirement_description: 'Identity document for seller FICA.',
    document_visibility: 'seller_visible',
    status: 'requested',
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
      token: 'seller-token-1',
      formData: {
        email: 'SELLER@example.com',
      },
    },
  },
  mandatePacket: { id: 'packet-1', status: 'fully_signed' },
  requirements: [
    requirement(),
    requirement({
      id: 'req-rates',
      requirement_key: 'rates_account',
      requirement_name: 'Rates Account',
    }),
    requirement({
      id: 'req-signed-mandate',
      requirement_key: 'signed_mandate',
      requirement_name: 'Signed Mandate',
    }),
    requirement({
      id: 'req-optional',
      requirement_key: 'body_corporate_rules',
      requirement_name: 'Body Corporate Rules',
      is_required: false,
    }),
  ],
  documents: [
    { requirement_id: 'req-rates', document_type: 'rates_account', status: 'uploaded' },
  ],
}

const ready = evaluateSellerPostMandateDocumentWorkflow(baseContext)
assert.equal(ready.ready, true)
assert.equal(ready.reason, SELLER_POST_MANDATE_DOCUMENT_REASON.READY)
assert.equal(ready.workflow.key, SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.key)
assert.equal(ready.sellerEmail, 'seller@example.com')
assert.equal(ready.portalToken, 'seller-token-1')
assert.equal(ready.outstandingDocumentCount, 1)
assert.equal(ready.outstandingDocuments[0].requirementKey, 'id_document')

const submitOnly = evaluateSellerPostMandateDocumentWorkflow({
  ...baseContext,
  listing: {
    ...baseContext.listing,
    mandateStatus: 'sent',
  },
  mandatePacket: { id: 'packet-1', status: 'sent' },
})
assert.equal(submitOnly.ready, false)
assert.equal(submitOnly.reason, SELLER_POST_MANDATE_DOCUMENT_REASON.MANDATE_NOT_SIGNED)

const onboardingMissing = evaluateSellerPostMandateDocumentWorkflow({
  ...baseContext,
  listing: {
    ...baseContext.listing,
    sellerOnboarding: { ...baseContext.listing.sellerOnboarding, status: 'in_progress' },
  },
})
assert.equal(onboardingMissing.reason, SELLER_POST_MANDATE_DOCUMENT_REASON.ONBOARDING_NOT_SUBMITTED)

const missingEmail = evaluateSellerPostMandateDocumentWorkflow({
  ...baseContext,
  listing: {
    ...baseContext.listing,
    sellerOnboarding: {
      ...baseContext.listing.sellerOnboarding,
      formData: { email: '' },
    },
  },
})
assert.equal(missingEmail.reason, SELLER_POST_MANDATE_DOCUMENT_REASON.MISSING_SELLER_EMAIL)

const missingPortal = evaluateSellerPostMandateDocumentWorkflow({
  ...baseContext,
  canCreatePortalContext: false,
  listing: {
    ...baseContext.listing,
    sellerOnboarding: {
      ...baseContext.listing.sellerOnboarding,
      token: '',
      sellerPortalToken: '',
      formData: { email: 'seller@example.com' },
    },
  },
})
assert.equal(missingPortal.reason, SELLER_POST_MANDATE_DOCUMENT_REASON.MISSING_PORTAL_CONTEXT)

const noOutstanding = evaluateSellerPostMandateDocumentWorkflow({
  ...baseContext,
  documents: [
    ...baseContext.documents,
    { requirement_id: 'req-id_document', document_type: 'id_document', status: 'approved' },
  ],
})
assert.equal(noOutstanding.reason, SELLER_POST_MANDATE_DOCUMENT_REASON.NO_OUTSTANDING_DOCUMENTS)

const rejectedFirst = getSellerPostMandateOutstandingDocuments({
  mandateSigned: true,
  requirements: [
    requirement({
      id: 'req-levy',
      requirement_key: 'levy_statement',
      requirement_name: 'Latest Levy Statement',
      status: 'rejected',
    }),
    requirement({
      id: 'req-proof',
      requirement_key: 'proof_of_address',
      requirement_name: 'Proof of Address',
      status: 'requested',
    }),
    requirement({
      id: 'req-agent-only',
      requirement_key: 'internal_notes',
      requirement_name: 'Internal Notes',
      document_visibility: 'internal',
    }),
  ],
})
assert.deepEqual(rejectedFirst.map((item) => item.requirementKey), ['levy_statement', 'proof_of_address'])
assert.equal(rejectedFirst[0].isReplacement, true)

assert.equal(isSellerPostMandateMandateSigned({ mandatePacket: { version: { final_signed_file_path: 'signed/mandate.pdf' } } }), true)
assert.equal(isSellerPostMandateMandateSigned({ mandateStatus: 'generated' }), false)

console.log('seller post-mandate document contract tests passed')
