import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerReviewedDocumentVersionIndex, createSellerReviewedDocumentVersions, verifySellerReviewedDocumentVersion } from '../sellerReviewedDocumentVersions.js'
import { getSellerDocumentSigningRouteReadiness, SELLER_DOCUMENT_SIGNING_ROUTES } from '../sellerDocumentSigningContract.js'

const approval = {
  status: 'approved', signingRoute: 'manual_upload',
  commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' },
}
const signingPack = {
  signers: [{ name: 'Alex Seller', role: 'Seller', email: 'alex@example.com' }, { name: 'Pat Seller', role: 'Co-owner', email: 'pat@example.com' }],
  mandate: { mandateType: 'sole', propertyAddress: '1 Test Road', specialConditions: 'No early termination' },
}
const manualSigningPack = {
  documents: [
    { key: 'signed_disclosure_form', generatedHtml: '<article>Disclosure</article>', sourceDraftFingerprint: 'draft-1' },
    { key: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>', sourceDraftFingerprint: 'draft-2' },
    { key: 'signed_mandate', generatedHtml: '<article>Mandate</article>' },
  ],
}

test('freezes each seller document with its own SHA-256 identity and full signer matrix', async () => {
  const pack = await createSellerReviewedDocumentVersions({ manualSigningPack, formalPackApproval: approval, signingPack, actor: 'agent-1', approvedAt: '2026-09-27T12:00:00Z' })
  assert.deepEqual(pack.documents.map((document) => document.requirementKey), ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'])
  assert.equal(new Set(pack.documents.map((document) => document.versionId)).size, 3)
  for (const document of pack.documents) {
    assert.match(document.versionDigest, /^sha256:[0-9a-f]{64}$/)
    assert.equal(document.requiredSigners.length, 2)
    assert.equal(document.status, 'awaiting_signed_hard_copy')
    assert.equal(await verifySellerReviewedDocumentVersion(document), true)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, generatedHtml: `${document.generatedHtml} changed` }), false)
    assert.equal(await verifySellerReviewedDocumentVersion({ ...document, sourceDraftFingerprint: 'changed' }), false)
  }
  assert.deepEqual(pack.documents[2].mandateTerms, signingPack.mandate)
  assert.equal(await verifySellerReviewedDocumentVersion({ ...pack.documents[2], requiredSigners: [pack.documents[2].requiredSigners[0]] }), false)
  assert.equal(await verifySellerReviewedDocumentVersion({ ...pack.documents[2], mandateTerms: { specialConditions: 'No early termination', propertyAddress: '1 Test Road', mandateType: 'sole' } }), true)
  const mandateReadiness = getSellerDocumentSigningRouteReadiness({
    documentKey: pack.documents[2].key,
    route: SELLER_DOCUMENT_SIGNING_ROUTES.GENERATE_DOWNLOAD,
    onboardingSubmitted: true,
    agentReviewed: true,
    finalVersionId: pack.documents[2].versionId,
    finalVersionDigest: pack.documents[2].versionDigest,
    commercialTermsConfirmed: approval.commission.confirmed,
    requiredSigners: pack.documents[2].requiredSigners,
  })
  assert.equal(mandateReadiness.ready, true)
  const index = buildSellerReviewedDocumentVersionIndex(pack)
  assert.equal(index.documents[0].versionId, pack.documents[0].versionId)
  assert.equal(JSON.stringify(index).includes('<article>'), false)
})

test('approval requires the agent, every signer, distinct rows, and confirmed mandate terms', async () => {
  const prepare = (override = {}) => createSellerReviewedDocumentVersions({ manualSigningPack, formalPackApproval: approval, signingPack, actor: 'agent-1', ...override })
  await assert.rejects(prepare({ actor: '' }), /agent/)
  await assert.rejects(prepare({ signingPack: { signers: [{ name: 'Alex', role: '' }] } }), /every required seller signer/)
  await assert.rejects(prepare({ manualSigningPack: { documents: [manualSigningPack.documents[0], manualSigningPack.documents[0]] } }), /distinct requirement row/)
  await assert.rejects(prepare({ formalPackApproval: { ...approval, commission: { confirmed: false } } }), /commission and VAT/)
  const physicalWithoutEmail = await prepare({ signingPack: { ...signingPack, signers: [{ name: 'Alex Seller', role: 'Seller', email: '' }] } })
  assert.equal(physicalWithoutEmail.documents[0].requiredSigners[0].email, '')
})
