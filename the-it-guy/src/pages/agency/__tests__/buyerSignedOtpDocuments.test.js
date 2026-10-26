import assert from 'node:assert/strict'
import { getBuyerSignedOtpDocuments } from '../buyerSignedOtpDocumentModel.js'
import { normalizeBuyerWorkspaceTab, resolveAgencyLeadWorkspaceTab } from '../agencyLeadWorkspaceRouteState.js'

const saved = { key: 'uploaded_otp', storageBucket: 'documents', storagePath: 'buyer/otp.pdf', fileName: 'signed-otp.pdf' }
assert.deepEqual(getBuyerSignedOtpDocuments(), [])
assert.equal(getBuyerSignedOtpDocuments({ requirements: [{ key: 'uploaded_otp', status: 'uploaded' }] }).length, 0, 'a status without a file must not expose a view action')
assert.equal(getBuyerSignedOtpDocuments({ uploads: [saved, { key: 'proof_of_address', storagePath: 'address.pdf' }], lead: { buyerOtpDocument: saved }, requirements: [saved] }).length, 1, 'the same file from canonical and legacy sources appears once')
assert.equal(getBuyerSignedOtpDocuments({ lead: { raw_enquiry_payload: JSON.stringify({ buyerOfferDocument: { url: 'https://example.invalid/otp.pdf' } }) } }).length, 1)
assert.equal(getBuyerSignedOtpDocuments({ lead: { buyerOtpDocument: { url: 'javascript:alert(1)' } } }).length, 0)
assert.equal(getBuyerSignedOtpDocuments({ lead: { rawEnquiryPayload: '{broken' } }).length, 0)
for (const tab of ['offer', 'offers', 'otp', 'onboarding_otp', 'buyer_onboarding_otp']) {
  assert.equal(normalizeBuyerWorkspaceTab(tab), 'documents')
  assert.equal(resolveAgencyLeadWorkspaceTab(`?tab=${tab}`), 'documents')
}
for (const tab of ['onboarding', 'buyer_onboarding', 'buyer_profile']) assert.equal(resolveAgencyLeadWorkspaceTab(`?tab=${tab}`), 'buyer_profile')
for (const tab of ['overview', 'documents', 'appointments', 'activity', 'seller', 'property']) assert.equal(resolveAgencyLeadWorkspaceTab(`?tab=${tab}`), tab)
console.log('buyer signed OTP documents and retired tab routing checks passed')
