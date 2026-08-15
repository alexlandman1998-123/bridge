import assert from 'node:assert/strict'
import {
  SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON,
  buildSellerPostMandateDocumentOrchestrationDedupeKey,
  buildSellerPostMandateDocumentOrchestrationPlan,
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
    propertyAddress: '12 Contract Road',
    assignedAgentName: 'Ava Agent',
    assignedAgentEmail: 'ava@example.com',
  },
  mandatePacket: { id: 'packet-1', status: 'fully_signed' },
  requirements: [
    requirement(),
    requirement({
      id: 'req-rates',
      requirement_key: 'rates_account',
      requirement_name: 'Rates Account',
      status: 'requested',
    }),
    requirement({
      id: 'req-mandate',
      requirement_key: 'signed_mandate',
      requirement_name: 'Signed Mandate',
      status: 'required',
    }),
  ],
  documents: [
    { requirement_id: 'req-rates', document_type: 'rates_account', status: 'uploaded' },
  ],
}

assert.equal(
  buildSellerPostMandateDocumentOrchestrationDedupeKey({ listingId: 'listing-1', mandatePacketId: 'packet-1' }),
  'seller_post_mandate_document_request:listing-1:packet-1:v1',
)

const plan = buildSellerPostMandateDocumentOrchestrationPlan(baseContext, {
  now: new Date('2026-07-20T08:00:00.000Z'),
  baseUrl: 'https://app.example.test',
})
assert.equal(plan.ready, true)
assert.equal(plan.requestPlan.counts.issued, 1)
assert.equal(plan.requestPlan.issued[0].requirementKey, 'id_document')
assert.equal(plan.requestPlan.issued.some((item) => item.requirementKey === 'signed_mandate'), false)
assert.equal(plan.emailPayload.portalLink, 'https://app.example.test/client/stable-seller-token/selling')
assert.deepEqual(
  plan.emailPayload.requiredDocuments.map((item) => item.key),
  ['id_document', 'proof_of_address', 'signed_fica_declaration', 'signed_disclosure_form', 'title_deed_copy'],
)
assert.equal(plan.notificationPayload.dedupeKey, plan.workflowRunDedupeKey)

const companyContext = {
  ...baseContext,
  listing: {
    ...baseContext.listing,
    sellerOnboarding: {
      ...baseContext.listing.sellerOnboarding,
      formData: {
        email: 'company-seller@example.com',
        ownershipType: 'company',
        companyName: 'Example Property Pty Ltd',
        companyRegistrationNumber: '2020/123456/07',
        companyRegisteredAddress: '1 Example Road',
        authorisedSignatoryName: 'Casey Director',
      },
    },
  },
  requirements: [
    requirement({ id: 'stale-individual-id', requirement_key: 'id_document', requirement_name: 'ID Document' }),
    requirement({ id: 'company-resolution-id', requirement_key: 'company_resolution_to_sell', requirement_name: 'Company Resolution' }),
  ],
  documents: [],
}
const companyPlan = buildSellerPostMandateDocumentOrchestrationPlan(companyContext, {
  baseUrl: 'https://app.example.test',
})
const companyEmailKeys = companyPlan.emailPayload.requiredDocuments.map((item) => item.key)
assert.equal(companyPlan.structureRequirementPack.source, 'seller_onboarding_structure')
assert.equal(companyPlan.emailPayload.sellerStructure.sellerType, 'company')
assert.ok(companyEmailKeys.includes('company_resolution_to_sell'), 'company sellers should receive company authority document requests')
assert.ok(companyEmailKeys.includes('director_member_ids'), 'company sellers should receive director/member FICA requests')
assert.equal(companyEmailKeys.includes('id_document'), false, 'stale individual-only requirements must not drive the company email checklist')
assert.equal(
  companyPlan.requestPlan.issued.some((item) => item.requirementKey === 'company_resolution_to_sell'),
  true,
  'persisted company rows should still be requestable after structure-aware merging',
)

const calls = []
const completed = await orchestrateSellerPostMandateDocumentRequest({
  context: baseContext,
  now: new Date('2026-07-20T08:00:00.000Z'),
  baseUrl: 'https://app.example.test',
  issueRequests: async ({ plan: runPlan }) => {
    calls.push('issueRequests')
    assert.deepEqual(
      runPlan.requestRequirements.map((item) => item.requirement_key || item.requirementKey).sort(),
      ['id_document', 'proof_of_address', 'signed_fica_declaration', 'signed_disclosure_form', 'title_deed_copy'].sort(),
    )
    return { counts: { issued: 1, existing: 0, suppressed: 0, applied: 1, failed: 0 }, applied: [{ requirementKey: 'id_document' }] }
  },
  issuePortalInvite: async ({ portalToken }) => {
    calls.push('issuePortalInvite')
    assert.equal(portalToken, 'stable-seller-token')
    return { inviteToken: 'invite-token-1', inviteExpiresAt: '2026-07-23T08:00:00.000Z' }
  },
  sendEmail: async ({ emailPayload }) => {
    calls.push('sendEmail')
    assert.equal(emailPayload.to, 'seller@example.com')
    assert.equal(emailPayload.portalLink, 'https://app.example.test/client/stable-seller-token/selling')
    assert.equal(emailPayload.outstandingDocumentCount, 5)
    return { ok: true, deliveryId: 'delivery-1' }
  },
  createNotification: async ({ notificationPayload }) => {
    calls.push('createNotification')
    assert.equal(notificationPayload.clientRole, 'seller')
    assert.equal(notificationPayload.metadata.outstandingDocumentKeys[0], 'id_document')
    return { id: 'notification-1' }
  },
  recordEvent: async ({ eventType, payload }) => {
    calls.push(eventType)
    assert.ok(payload.dedupeKey)
    return { ok: true }
  },
})
assert.equal(completed.sent, true)
assert.equal(completed.reason, SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.COMPLETED)
assert.deepEqual(calls, [
  'issueRequests',
  'issuePortalInvite',
  'sendEmail',
  'createNotification',
  'seller_post_mandate_documents_completed',
])

let dedupeWorkRan = false
const deduped = await orchestrateSellerPostMandateDocumentRequest({
  context: baseContext,
  hasAlreadyCompleted: async ({ dedupeKey }) => {
    assert.equal(dedupeKey, 'seller_post_mandate_document_request:listing-1:packet-1:v1')
    return true
  },
  issueRequests: async () => {
    dedupeWorkRan = true
  },
  sendEmail: async () => {
    dedupeWorkRan = true
  },
})
assert.equal(deduped.skipped, true)
assert.equal(deduped.reason, SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.ALREADY_COMPLETED)
assert.equal(dedupeWorkRan, false)

const tokenlessContext = {
  ...baseContext,
  listing: {
    ...baseContext.listing,
    sellerOnboarding: {
      ...baseContext.listing.sellerOnboarding,
      token: '',
    },
  },
}
const resolvedPortal = await orchestrateSellerPostMandateDocumentRequest({
  context: tokenlessContext,
  baseUrl: 'https://app.example.test',
  ensurePortalContext: async () => ({ sellerWorkspaceToken: 'created-token-1' }),
  issueRequests: async () => ({ counts: { issued: 1, existing: 0, suppressed: 0, applied: 1, failed: 0 } }),
  sendEmail: async ({ emailPayload }) => {
    assert.equal(emailPayload.portalLink, 'https://app.example.test/client/created-token-1/selling')
    return { ok: true }
  },
})
assert.equal(resolvedPortal.sent, true)
assert.equal(resolvedPortal.portalToken, 'created-token-1')

let skippedWorkRan = false
const skipped = await orchestrateSellerPostMandateDocumentRequest({
  context: {
    ...baseContext,
    listing: {
      ...baseContext.listing,
      mandateStatus: 'sent',
    },
    mandatePacket: { id: 'packet-1', status: 'sent' },
  },
  issueRequests: async () => {
    skippedWorkRan = true
  },
  sendEmail: async () => {
    skippedWorkRan = true
  },
})
assert.equal(skipped.skipped, true)
assert.equal(skipped.reason, 'mandate_not_signed')
assert.equal(skippedWorkRan, false)

console.log('seller post-mandate document orchestration tests passed')
