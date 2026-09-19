import assert from 'node:assert/strict'
import {
  SELLER_MANDATE_TERMS_DOCUMENT_KEY,
  SELLER_MANDATE_TERMS_APPROVAL_STATUS,
  assessSellerMandateTermsPolicy,
  buildSellerMandateTermsDocumentModel,
} from '../src/core/documents/sellerMandateTermsPolicy.js'
import { buildSellerSigningDocumentModel } from '../src/lib/sellerSigningPackDocumentModel.js'

const basePolicy = {
  organisationId: 'agency-1',
  version: 'agency-terms-v1',
  contentDigest: `sha256:${'a'.repeat(64)}`,
  effectiveAt: '2026-09-18T00:00:00.000Z',
  privacyNoticeUrl: 'https://agency.example/privacy',
  paiaManualUrl: 'https://agency.example/paia',
  informationOfficerName: 'Privacy Officer',
  informationOfficerEmail: 'privacy@agency.example',
  sections: [
    { key: 'mandate_terms', title: 'Mandate terms', body: 'Approved mandate terms.' },
    { key: 'privacy_notice_summary', title: 'Privacy', body: 'Approved privacy summary.' },
    { key: 'paia_access_information', title: 'PAIA', body: 'Approved PAIA information.' },
    { key: 'electronic_communications_and_signing', title: 'Electronic signing', body: 'Approved electronic-signing terms.' },
    { key: 'records_and_audit_trail', title: 'Records', body: 'Approved records terms.' },
  ],
}

const pending = assessSellerMandateTermsPolicy({ ...basePolicy, status: SELLER_MANDATE_TERMS_APPROVAL_STATUS.pendingCounselReview })
assert.equal(pending.ready, false)
assert(pending.missing.includes('counsel approval'))
assert.equal(buildSellerMandateTermsDocumentModel(pending.policy), null)

const approvedPolicy = {
  ...basePolicy,
  status: SELLER_MANDATE_TERMS_APPROVAL_STATUS.approved,
  approvedBy: 'Agency counsel',
  approvedAt: '2026-09-18T12:00:00.000Z',
}
const approved = assessSellerMandateTermsPolicy(approvedPolicy)
assert.equal(approved.ready, true)
const document = buildSellerMandateTermsDocumentModel(approvedPolicy)
assert.equal(document.key, SELLER_MANDATE_TERMS_DOCUMENT_KEY)
assert.equal(document.termsVersion, 'agency-terms-v1')
assert.equal(document.contentDigest, `sha256:${'a'.repeat(64)}`)
assert.equal(document.sections.length, 5)
assert.equal(document.informationOfficer.email, 'privacy@agency.example')
assert.equal(buildSellerSigningDocumentModel({ sellerMandateTerms: approvedPolicy }, SELLER_MANDATE_TERMS_DOCUMENT_KEY).title, document.title)

console.log('Seller mandate terms Phase 1 checks passed.')
