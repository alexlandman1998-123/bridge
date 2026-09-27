import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SELLER_DOCUMENT_SIGNING_ROUTES,
  SELLER_DOCUMENT_SIGNING_STATES,
  getSellerDocumentSigningDefinition,
  getSellerDocumentSigningRouteReadiness,
  getSellerDocumentSigningState,
  hasCompletedOnboardingDisclosureSignature,
} from '../sellerDocumentSigningContract.js'
import { PROPERTY_DISCLOSURE_QUESTIONS } from '../../../lib/propertyDisclosure.js'

const finalDocument = {
  onboardingSubmitted: true,
  agentReviewed: true,
  finalVersionId: 'version-1',
  finalVersionDigest: 'sha256:original',
  requiredSigners: [{ name: 'Alex Seller', role: 'owner', email: 'alex@example.test' }],
}
const requiredSigners = finalDocument.requiredSigners
const signedDisclosure = {
  kind: 'residential',
  responses: Object.fromEntries(PROPERTY_DISCLOSURE_QUESTIONS.map((question) => [question.key, { answer: 'no' }])),
  declarationAccepted: true,
  signature: 'data:image/png;base64,AA',
  signedAt: '2026-09-27',
  arch9TermsAccepted: true,
}

test('recognises an actual onboarding disclosure signature, including all required signers', () => {
  assert.equal(hasCompletedOnboardingDisclosureSignature({}), false)
  assert.equal(hasCompletedOnboardingDisclosureSignature({ propertyDisclosure: signedDisclosure }), true)
  assert.equal(hasCompletedOnboardingDisclosureSignature({ propertyDisclosure: signedDisclosure, sellerComplianceSigning: { complete: false } }), false)
  assert.equal(hasCompletedOnboardingDisclosureSignature({ propertyDisclosure: signedDisclosure, sellerComplianceSigning: { complete: true } }), true)
})

test('only the three seller pack documents offer the two signing routes', () => {
  for (const key of ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate']) {
    assert.ok(getSellerDocumentSigningDefinition(key))
    const physical = getSellerDocumentSigningRouteReadiness({
      documentKey: key,
      route: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD,
      ...finalDocument,
      commercialTermsConfirmed: true,
      requiredSigners,
    })
    assert.equal(physical.ready, true)
    const portal = getSellerDocumentSigningRouteReadiness({
      documentKey: key,
      route: SELLER_DOCUMENT_SIGNING_ROUTES.SEND_FOR_SIGNATURE,
      ...finalDocument,
      commercialTermsConfirmed: true,
      requiredSigners,
    })
    assert.equal(portal.ready, false)
    assert.equal(portal.reasons.includes('legal_approval_required'), false)
    assert.ok(portal.reasons.includes('portal_signing_not_enabled'))
  }
  assert.equal(getSellerDocumentSigningDefinition('offer_to_purchase'), null)
  assert.equal(getSellerDocumentSigningRouteReadiness({ documentKey: 'offer_to_purchase', route: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD, ...finalDocument }).ready, false)
})

test('mandate terms and one reviewed frozen version are required before either route', () => {
  const early = getSellerDocumentSigningRouteReadiness({
    documentKey: 'signed_mandate',
    route: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD,
    onboardingSubmitted: true,
  })
  assert.ok(early.reasons.includes('agent_review_required'))
  assert.ok(early.reasons.includes('final_version_required'))
  assert.ok(early.reasons.includes('commercial_terms_required'))
  assert.ok(early.reasons.includes('required_signers_missing'))
  assert.equal(getSellerDocumentSigningState({ documentKey: 'signed_mandate', ...finalDocument }).state, SELLER_DOCUMENT_SIGNING_STATES.AWAITING_AGENT_REVIEW)
  assert.equal(getSellerDocumentSigningState({ documentKey: 'signed_mandate', ...finalDocument, commercialTermsConfirmed: true }).state, SELLER_DOCUMENT_SIGNING_STATES.READY)
})

test('submission, download, and sending never count as signed evidence', () => {
  const base = { documentKey: 'signed_disclosure_form', ...finalDocument }
  assert.equal(getSellerDocumentSigningState({ documentKey: base.documentKey, onboardingSubmitted: true }).state, SELLER_DOCUMENT_SIGNING_STATES.AWAITING_AGENT_REVIEW)
  assert.equal(getSellerDocumentSigningState(base).state, SELLER_DOCUMENT_SIGNING_STATES.READY)
  assert.equal(getSellerDocumentSigningState({ ...base, issuedRoute: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD, issuedVersionId: 'version-1', issuedVersionDigest: 'sha256:original' }).state, SELLER_DOCUMENT_SIGNING_STATES.AWAITING_SIGNATURE)
  assert.equal(getSellerDocumentSigningState({ ...base, issuedRoute: SELLER_DOCUMENT_SIGNING_ROUTES.SEND_FOR_SIGNATURE, issuedVersionId: 'version-1', issuedVersionDigest: 'sha256:original' }).state, SELLER_DOCUMENT_SIGNING_STATES.AWAITING_SIGNATURE)
  assert.equal(getSellerDocumentSigningState({ ...base, issuedRoute: SELLER_DOCUMENT_SIGNING_ROUTES.SEND_FOR_SIGNATURE, issuedVersionId: 'version-1', issuedVersionDigest: 'sha256:older' }).state, SELLER_DOCUMENT_SIGNING_STATES.READY)
})

test('only complete evidence for the frozen version can be signed and reviewed', () => {
  const base = {
    documentKey: 'signed_fica_declaration',
    ...finalDocument,
    issuedRoute: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD,
    issuedVersionId: 'version-1',
    issuedVersionDigest: 'sha256:original',
  }
  const signedEvidence = {
    artifactId: 'signed-file-1',
    documentVersionId: 'version-1',
    documentVersionDigest: 'sha256:original',
    allRequiredSignersComplete: true,
  }
  assert.equal(getSellerDocumentSigningState({ ...base, signedEvidence: { ...signedEvidence, documentVersionDigest: 'sha256:changed' } }).state, SELLER_DOCUMENT_SIGNING_STATES.AWAITING_SIGNATURE)
  assert.equal(getSellerDocumentSigningState({ ...base, signedEvidence: { ...signedEvidence, allRequiredSignersComplete: false } }).state, SELLER_DOCUMENT_SIGNING_STATES.AWAITING_SIGNATURE)
  assert.equal(getSellerDocumentSigningState({ ...base, signedEvidence }).state, SELLER_DOCUMENT_SIGNING_STATES.SIGNED)
  assert.equal(getSellerDocumentSigningState({ ...base, signedEvidence, reviewedAt: '2026-09-27T12:00:00Z' }).state, SELLER_DOCUMENT_SIGNING_STATES.SIGNED)
  assert.equal(getSellerDocumentSigningState({ ...base, signedEvidence, reviewedAt: '2026-09-27T12:00:00Z', reviewedBy: 'agent-1' }).state, SELLER_DOCUMENT_SIGNING_STATES.REVIEWED)
})
