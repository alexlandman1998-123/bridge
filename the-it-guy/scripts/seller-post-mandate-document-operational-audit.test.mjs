import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildSellerPostMandateDocumentAuditSummary,
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

const context = {
  listing: {
    id: 'listing-audit-1',
    organisationId: 'org-audit-1',
    mandateStatus: 'signed',
    sellerOnboarding: {
      status: 'completed',
      token: 'seller-audit-token',
      formData: {
        email: 'company-seller@example.com',
        ownershipType: 'company',
        companyName: 'Audit Property Pty Ltd',
        companyRegistrationNumber: '2020/123456/07',
        companyRegisteredAddress: '1 Audit Road',
        authorisedSignatoryName: 'Casey Director',
      },
    },
  },
  mandatePacket: { id: 'packet-audit-1', status: 'fully_signed' },
  requirements: [
    requirement({ id: 'stale-id', requirement_key: 'id_document', requirement_name: 'ID Document' }),
    requirement({ id: 'resolution-id', requirement_key: 'company_resolution_to_sell', requirement_name: 'Company Resolution' }),
  ],
  documents: [],
}

const plan = buildSellerPostMandateDocumentOrchestrationPlan(context)
const summary = buildSellerPostMandateDocumentAuditSummary(plan, {
  status: 'completed',
  reason: 'completed',
  requestIssuance: { counts: { issued: 2, existing: 0, suppressed: 0, applied: 2, failed: 0 } },
  emailResult: { deliveryId: 'delivery-audit-1', canonicalInviteId: 'invite-audit-1' },
  notification: { id: 'notification-audit-1' },
  portalToken: 'seller-audit-token',
  portalLink: 'https://app.example.test/client/seller-audit-token/selling',
})

assert.equal(summary.workflowKey, 'seller_post_mandate_document_request')
assert.equal(summary.status, 'completed')
assert.equal(summary.reason, 'completed')
assert.equal(summary.documentPackSource, 'seller_onboarding_structure')
assert.equal(summary.sellerStructure.sellerType, 'company')
assert.ok(summary.outstandingDocumentKeys.includes('company_resolution_to_sell'))
assert.ok(summary.outstandingDocumentKeys.includes('director_member_ids'))
assert.equal(summary.outstandingDocumentKeys.includes('id_document'), false)
assert.equal(summary.notificationCreated, true)
assert.equal(summary.portalLinkPresent, true)
assert.equal(summary.emailDeliveryId, 'delivery-audit-1')

let recordedPayload = null
const completed = await orchestrateSellerPostMandateDocumentRequest({
  context,
  baseUrl: 'https://app.example.test',
  issueRequests: async () => ({ counts: { issued: 2, existing: 0, suppressed: 0, applied: 2, failed: 0 } }),
  issuePortalInvite: async () => ({ inviteToken: 'seller-audit-invite', inviteExpiresAt: '2026-07-30T10:00:00.000Z' }),
  sendEmail: async () => ({ deliveryId: 'delivery-audit-2', canonicalInviteId: 'invite-audit-2' }),
  createNotification: async () => ({ id: 'notification-audit-2' }),
  recordEvent: async ({ eventType, payload }) => {
    if (eventType === 'seller_post_mandate_documents_completed') recordedPayload = payload
    return { id: 'event-audit-1' }
  },
})

assert.equal(completed.auditSummary.status, 'completed')
assert.equal(completed.auditSummary.emailDeliveryId, 'delivery-audit-2')
assert.equal(recordedPayload.auditSummary.documentPackFingerprint, completed.documentPackFingerprint)
assert.deepEqual(recordedPayload.auditSummary.outstandingDocumentKeys, completed.auditSummary.outstandingDocumentKeys)

const privateListingService = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)
assert.match(privateListingService, /createSellerPostMandateActivityFromAudit/, 'mandate trigger should persist an activity row for operational visibility')
assert.match(privateListingService, /activityType:\s*isCompleted[\s\S]*seller_post_mandate_documents_requested/, 'completed requests should have a dedicated activity type')
assert.match(privateListingService, /visibility:\s*isCompleted \? 'client_visible' : 'internal'/, 'completed seller requests should be visible in the seller timeline while skipped diagnostics stay internal')
assert.match(privateListingService, /auditSummary,\n\s*}/, 'packet event payload should include the structured audit summary')
assert.match(privateListingService, /documentPackSource: normalizeText\(auditSummary\?\.documentPackSource\)/, 'packet event payload should expose the document pack source')
assert.match(privateListingService, /outstandingDocumentKeys: Array\.isArray\(auditSummary\?\.outstandingDocumentKeys\)/, 'packet event payload should expose requested document keys')

console.log('seller post-mandate document operational audit tests passed')
