import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerReviewedDocumentVersions } from '../sellerReviewedDocumentVersions.js'
import { downloadSellerPhysicalSigningCopy, getSellerPhysicalSigningCopy, getSellerPortalSignedUploadReference } from '../sellerPhysicalSigningCopy.js'

const approval = { status: 'approved', signingRoute: 'manual_upload', commission: { confirmed: true } }
const signingPack = { signers: [{ name: 'Alex Seller', role: 'Seller' }], mandate: { propertyAddress: '1 Test Road' } }

async function reviewedMandate() {
  const pack = await createSellerReviewedDocumentVersions({
    manualSigningPack: { documents: [{ key: 'signed_mandate', generatedHtml: '<article>Frozen mandate</article>', generatedFileName: 'mandate.pdf' }] },
    formalPackApproval: approval,
    signingPack,
    actor: 'agent-1',
  })
  return { ...pack.documents[0], source: 'seller_onboarding.manual_signing_pack' }
}

test('downloads the reviewed source after a signed upload becomes the preferred row', async () => {
  const copy = await reviewedMandate()
  const row = {
    status: 'uploaded',
    original: { document: { id: 'uploaded-document', status: 'uploaded', storage_path: 'signed.pdf' } },
    originalRows: [{ original: { document: copy } }],
  }
  assert.equal(getSellerPhysicalSigningCopy(row), copy)
  let downloaded = null
  await downloadSellerPhysicalSigningCopy(row, async (html, fileName) => { downloaded = { html, fileName } })
  assert.deepEqual(downloaded, { html: copy.generatedHtml, fileName: 'mandate.pdf' })
  assert.equal(row.status, 'uploaded')
})

test('changed reviewed content cannot be downloaded', async () => {
  const copy = await reviewedMandate()
  const row = { original: { document: { ...copy, generatedHtml: '<article>Changed mandate</article>' } } }
  await assert.rejects(downloadSellerPhysicalSigningCopy(row, async () => {}), /changed since approval/)
})

test('returned portal files use the exact opened version for each signing document; standalone files retain their existing path', async () => {
  const reviewed = await createSellerReviewedDocumentVersions({ manualSigningPack: { documents: ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate']
    .map(key => ({ key, generatedHtml: `<article>Frozen ${key}</article>` })) }, formalPackApproval: approval, signingPack, actor: 'agent-1' })
  const form = { sellerOnboardingManualSigningPack: { documents: reviewed.documents } }
  for (const copy of reviewed.documents) {
    assert.deepEqual(await getSellerPortalSignedUploadReference(form, copy.key), { reviewedSigningVersionId: copy.versionId, reviewedSigningVersionDigest: copy.versionDigest })
  }
  assert.equal(await getSellerPortalSignedUploadReference(form, 'identity_document'), null)
  assert.equal(await getSellerPortalSignedUploadReference({}, 'signed_mandate'), null)
  const original = reviewed.documents[0].generatedHtml
  reviewed.documents[0].generatedHtml = '<article>Substituted disclosure</article>'
  await assert.rejects(getSellerPortalSignedUploadReference(form, 'signed_disclosure_form'), /changed since approval/)
  reviewed.documents[0].generatedHtml = original
})

test('opening an older versioned copy does not regenerate its approved HTML', async () => {
  const { buildSellerOnboardingManualSigningDocuments } = await import('../../../services/sellerDocumentRequirementsService.js')
  const copy = await reviewedMandate()
  const rows = buildSellerOnboardingManualSigningDocuments({
    sellerFirstName: 'Alex', sellerSurname: 'Seller', ownershipType: 'individual', mandateType: 'sole',
    sellerOnboardingFormalPackApproval: approval,
    sellerOnboardingManualSigningPack: { status: 'awaiting_signed_hard_copy', documents: [copy] },
    sellerPostOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>New FICA</article>' }] },
  }, { id: 'listing-1', sellerOnboardingStatus: 'completed' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].generatedHtml, copy.generatedHtml)
  assert.equal(rows[0].versionDigest, copy.versionDigest)
})
