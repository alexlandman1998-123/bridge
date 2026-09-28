import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingManualSigningPack, createSellerOnboardingSigningCopyPack } from '../sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions, verifySellerReviewedDocumentVersion } from '../sellerReviewedDocumentVersions.js'
import { buildSellerPostOnboardingDrafts } from '../sellerPostOnboardingDrafts.js'

test('creates printable FICA and mandate copies that remain awaiting wet-ink upload', () => {
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
    signingPack: { seller: { name: 'Alex Seller', idNumber: '123' }, branding: { organisationName: 'Home Seekers', primaryColour: '#123456' }, mandate: { propertyAddress: '1 Test Road', askingPrice: 'R 1 000 000', mandateType: 'sole', startDate: '2026-09-27', endDate: '2026-12-27' } },
    postOnboardingDrafts: { documents: [{ key: 'fica_review_draft', targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] },
    generatedAt: '2026-09-19T11:00:00.000Z',
  })
  assert.equal(pack.status, 'awaiting_signed_hard_copy')
  assert.deepEqual(pack.documents.map((document) => document.key), ['signed_fica_declaration', 'signed_mandate'])
  assert.match(pack.documents[1].generatedHtml, /reviewed signing copy/i)
  assert.match(pack.documents[1].generatedHtml, /Alex Seller/)
  assert.match(pack.documents[1].generatedHtml, /Exclusive Mandate to Sell/)
  assert.match(pack.documents[1].generatedHtml, /Home Seekers/)
  assert.match(pack.documents[0].generatedHtml, /CLIENT DUE DILIGENCE RECORD/)
  assert.match(pack.documents[0].generatedHtml, /Not yet verified by the agency/)
  assert.doesNotMatch(pack.documents[1].generatedHtml, /180 calendar days/)
})

test('open mandate uses its own non-exclusive wording and page layout', () => {
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { basis: 'fixed', amount: '50000', vatHandling: 'inclusive' } },
    signingPack: { seller: { name: 'Sam Seller' }, branding: { organisationName: 'Home Seekers' }, mandate: { mandateType: 'open', propertyAddress: '1 Test Road', protectionPeriod: '30' } },
    postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', metadata: {} }] },
  })
  assert.match(pack.documents[1].generatedHtml, /Open Mandate to Sell/)
  assert.match(pack.documents[1].generatedHtml, /non-exclusive basis/)
  assert.match(pack.documents[1].generatedHtml, /30 calendar days/)
  assert.equal((pack.documents[1].generatedHtml.match(/class="page"/g) || []).length, 2)
  assert.equal((pack.documents[0].generatedHtml.match(/class="page"/g) || []).length, 3)
})

test('does not create signing copies before agent approval', () => {
  assert.throws(() => createSellerOnboardingManualSigningPack({ formalPackApproval: { status: 'pending', signingRoute: 'digital_pack' } }), /Approve the onboarding/)
})

test('physical and digital routes use identical reviewed content', () => {
  const input = {
    signingPack: { seller: { name: 'Alex Seller' }, branding: { organisationName: 'Home Seekers' }, mandate: { mandateType: 'sole' } },
    postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', metadata: {} }] },
    generatedAt: '2026-09-27T12:00:00.000Z',
  }
  const physical = createSellerOnboardingManualSigningPack({ ...input, formalPackApproval: { status: 'approved', signingRoute: 'manual_upload' } })
  const digital = createSellerOnboardingManualSigningPack({ ...input, formalPackApproval: { status: 'approved', signingRoute: 'digital_pack' } })
  assert.deepEqual(physical.documents.map((document) => document.generatedHtml), digital.documents.map((document) => document.generatedHtml))
  assert.equal(digital.status, 'awaiting_signature')
  assert.deepEqual(digital.documents.map((document) => document.signingRoute), ['digital_pack', 'digital_pack'])
})

test('includes an outstanding disclosure in the selected route without changing its reviewed HTML', () => {
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'digital_pack', documentRoutes: { signed_disclosure_form: 'digital_pack', signed_fica_declaration: 'manual_upload', signed_mandate: 'digital_pack' } },
    signingPack: { seller: { name: 'Alex Seller' }, mandate: { mandateType: 'sole' } },
    postOnboardingDrafts: { documents: [
      { key: 'signed_disclosure_form', generatedHtml: '<html>Reviewed defects form</html>' },
      { targetRequirementKey: 'signed_fica_declaration', metadata: {} },
    ] },
    formData: { propertyDisclosure: { signature: 'Alex Seller', signedAt: '2026-09-27T12:00:00Z' }, sellerComplianceSigning: { complete: false } },
  })
  assert.deepEqual(pack.documents.map((document) => document.key), ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'])
  assert.equal(pack.documents[0].generatedHtml, '<html>Reviewed defects form</html>')
  assert.equal(pack.documents[0].signingRoute, 'digital_pack')
  assert.equal(pack.documents[1].signingRoute, 'manual_upload')
})

test('retains the previously frozen document when a replacement is prepared', () => {
  const pack = createSellerOnboardingManualSigningPack({
    existing: { generatedAt: '2026-09-20T10:00:00Z', documents: [{ key: 'signed_mandate', versionId: 'old-v1', generatedHtml: '<article>Previous approved terms</article>' }] },
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload' },
    signingPack: { seller: { name: 'Alex Seller' }, mandate: { mandateType: 'sole' } },
    postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', metadata: {} }] },
  })
  assert.equal(pack.versionHistory[0].documents[0].versionId, 'old-v1')
  assert.match(pack.versionHistory[0].documents[0].generatedHtml, /Previous approved terms/)
})

test('mandate replacement does not create another FICA declaration', () => {
  const pack = createSellerOnboardingSigningCopyPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', selectedDocuments: ['mandate'], commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
    signingPack: { branding: { organisationName: 'Kingdom Real Estate' }, seller: { name: 'Alex Seller' }, signers: [{ name: 'Alex Seller', role: 'Seller' }], mandate: { mandateType: 'sole' } },
    postOnboardingDrafts: { documents: [] },
    disclosureSigned: true,
  })
  assert.deepEqual(pack.documents.map((document) => document.key), ['signed_mandate'])
})

test('portal and physical routes freeze the same reviewed document content', async () => {
  const signingPack = {
    branding: { organisationName: 'Kingdom Real Estate' },
    seller: { name: 'Alex Seller', idNumber: '123' },
    signers: [{ name: 'Alex Seller', role: 'Seller', email: 'alex@example.com' }],
    mandate: { mandateType: 'sole', propertyAddress: '1 Test Road' },
  }
  const postOnboardingDrafts = { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] }
  const prepared = []
  for (const signingRoute of ['manual_upload', 'digital_pack']) {
    const formalPackApproval = { status: 'approved', signingRoute, commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } }
    const copies = createSellerOnboardingSigningCopyPack({ formalPackApproval, signingPack, postOnboardingDrafts, disclosureSigned: true, generatedAt: '2026-09-27T12:00:00Z' })
    const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: copies, formalPackApproval, signingPack, actor: 'agent-1', approvedAt: '2026-09-27T12:00:00Z' })
    assert.deepEqual(frozen.documents.map((document) => document.key), ['signed_fica_declaration', 'signed_mandate'])
    assert.equal(frozen.documents.every((document) => document.signingRoute === signingRoute), true)
    assert.equal(frozen.documents.every((document) => document.requiredSigners[0].email === 'alex@example.com'), true)
    for (const document of frozen.documents) assert.equal(await verifySellerReviewedDocumentVersion(document), true)
    prepared.push(frozen.documents.map((document) => document.generatedHtml))
  }
  assert.deepEqual(prepared[0], prepared[1])
})

test('replacing the mandate keeps the unchanged FICA version', async () => {
  const signingPack = {
    branding: { organisationName: 'Kingdom Real Estate' },
    seller: { name: 'Alex Seller' },
    signers: [{ name: 'Alex Seller', role: 'Seller', email: 'alex@example.com' }],
    mandate: { mandateType: 'sole', propertyAddress: '1 Test Road' },
  }
  const initialApproval = { status: 'approved', signingRoute: 'digital_pack', selectedDocuments: ['fica', 'mandate'], commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } }
  const initialPack = createSellerOnboardingSigningCopyPack({ formalPackApproval: initialApproval, signingPack, postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] }, disclosureSigned: true })
  const initialVersions = await createSellerReviewedDocumentVersions({ manualSigningPack: initialPack, formalPackApproval: initialApproval, signingPack, actor: 'agent-1' })
  initialPack.documents = initialVersions.documents

  const replacementApproval = { ...initialApproval, selectedDocuments: ['mandate'] }
  const replacementPack = createSellerOnboardingSigningCopyPack({ existing: initialPack, formalPackApproval: replacementApproval, signingPack, postOnboardingDrafts: { documents: [] }, disclosureSigned: true })
  const replacementVersions = await createSellerReviewedDocumentVersions({ manualSigningPack: replacementPack, formalPackApproval: replacementApproval, signingPack, actor: 'agent-1' })
  const originalFica = initialVersions.documents.find((document) => document.key === 'signed_fica_declaration')
  const retainedFica = replacementVersions.documents.find((document) => document.key === 'signed_fica_declaration')
  assert.equal(retainedFica.versionId, originalFica.versionId)
  assert.equal(await verifySellerReviewedDocumentVersion(retainedFica), true)
  assert.notEqual(replacementVersions.documents.find((document) => document.key === 'signed_mandate').versionId,
    initialVersions.documents.find((document) => document.key === 'signed_mandate').versionId)
})

test('mandate replacement requires FICA review when seller FICA facts changed', async () => {
  const signingPack = {
    branding: { organisationName: 'Kingdom Real Estate' },
    seller: { name: 'Alex Seller' },
    signers: [{ name: 'Alex Seller', role: 'Seller', email: 'alex@example.com' }],
    mandate: { mandateType: 'sole', propertyAddress: '1 Test Road' },
  }
  const initialApproval = { status: 'approved', signingRoute: 'digital_pack', selectedDocuments: ['fica', 'mandate'], commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } }
  const formData = { sellerFirstName: 'Alex', sellerSurname: 'Seller', idNumber: '1234567890123', email: 'alex@example.com' }
  const drafts = buildSellerPostOnboardingDrafts({ formData, listing: { id: 'listing-1' }, generatedAt: '2026-09-27T12:00:00Z' })
  const initialPack = createSellerOnboardingSigningCopyPack({ formalPackApproval: initialApproval, signingPack, postOnboardingDrafts: drafts, disclosureSigned: true })
  const initialVersions = await createSellerReviewedDocumentVersions({ manualSigningPack: initialPack, formalPackApproval: initialApproval, signingPack, actor: 'agent-1' })
  initialPack.documents = initialVersions.documents

  const replacementApproval = { ...initialApproval, selectedDocuments: ['mandate'] }
  const unchangedDrafts = buildSellerPostOnboardingDrafts({ formData, listing: { id: 'listing-1' }, generatedAt: '2026-09-27T14:00:00Z' })
  assert.doesNotThrow(() => createSellerOnboardingSigningCopyPack({ existing: initialPack, formalPackApproval: replacementApproval, signingPack, postOnboardingDrafts: unchangedDrafts, disclosureSigned: true }))

  const changedDrafts = buildSellerPostOnboardingDrafts({ formData: { ...formData, idNumber: '9876543210987' }, listing: { id: 'listing-1' }, generatedAt: '2026-09-27T14:00:00Z' })
  assert.throws(() => createSellerOnboardingSigningCopyPack({ existing: initialPack, formalPackApproval: replacementApproval, signingPack, postOnboardingDrafts: changedDrafts, disclosureSigned: true }), /FICA details changed/)
})

test('FICA replacement requires mandate review when its commission changed', async () => {
  const signingPack = {
    branding: { organisationName: 'Kingdom Real Estate' },
    seller: { name: 'Alex Seller' },
    signers: [{ name: 'Alex Seller', role: 'Seller', email: 'alex@example.com' }],
    mandate: { mandateType: 'sole', propertyAddress: '1 Test Road' },
  }
  const initialApproval = { status: 'approved', signingRoute: 'digital_pack', selectedDocuments: ['fica', 'mandate'], commission: { confirmed: true, basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } }
  const postOnboardingDrafts = { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] }
  const initialPack = createSellerOnboardingSigningCopyPack({ formalPackApproval: initialApproval, signingPack, postOnboardingDrafts, disclosureSigned: true })
  const initialVersions = await createSellerReviewedDocumentVersions({ manualSigningPack: initialPack, formalPackApproval: initialApproval, signingPack, actor: 'agent-1' })
  initialPack.documents = initialVersions.documents

  const replacementApproval = { ...initialApproval, selectedDocuments: ['fica'] }
  assert.doesNotThrow(() => createSellerOnboardingSigningCopyPack({ existing: initialPack, formalPackApproval: replacementApproval, signingPack, postOnboardingDrafts, disclosureSigned: true }))
  assert.throws(() => createSellerOnboardingSigningCopyPack({ existing: initialPack, formalPackApproval: { ...replacementApproval, commission: { ...replacementApproval.commission, percentage: '6' } }, signingPack, postOnboardingDrafts, disclosureSigned: true }), /mandate details changed/)
})
