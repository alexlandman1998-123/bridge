import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { createSellerCorrectionFixture } from '../../../../scripts/fixtures/seller-document-corrections.mjs'
import { buildSellerPostOnboardingDrafts } from '../sellerPostOnboardingDrafts.js'
import { createSellerOnboardingSigningCopyPack } from '../sellerOnboardingManualSigningPack.js'
import { createSellerReviewedDocumentVersions } from '../sellerReviewedDocumentVersions.js'
import { applySellerDocumentSignatureEvidence } from '../sellerDocumentSignatureEvidence.js'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
async function fixture(count = 2) {
  const copy = createSellerCorrectionFixture('multiple_owners')
  copy.form.propertyDisclosure.signature = ''; copy.form.propertyDisclosure.signedAt = ''
  copy.form.occupation = 'Awaiting signature — Page 3 of 99 (captured note)'
  const signingPack = copy.pack.signingPackSnapshot
  while (signingPack.signers.length < count) {
    const number = signingPack.signers.length + 1
    signingPack.signers.push({ name: `Owner ${number}`, role: `Owner ${number}`, email: `owner${number}@example.test` })
    copy.form.multipleOwners.push({ firstName: 'Owner', surname: `${number}`, idNumber: `OWNER-${number}`, email: `owner${number}@example.test` })
  }
  const approval = { ...copy.approval, selectedDocuments: ['fica'], signingRoute: 'digital_pack' }
  const drafts = buildSellerPostOnboardingDrafts({ formData: copy.form, listing: { id: 'synthetic-final-document' }, branding: signingPack.branding })
  const prepared = createSellerOnboardingSigningCopyPack({ signingPack, formalPackApproval: approval, postOnboardingDrafts: drafts })
  const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: prepared, formalPackApproval: approval, signingPack, actor: 'synthetic-reviewer' })
  const evidence = document => document.requiredSigners.map((signer, index) => ({ signer_email: signer.email, signer_role: signer.role, signed_name: signer.name,
    document_version_digest: document.versionDigest, signature_type: 'drawn', signature_value: png,
    signed_date: new Date('2026-10-04T00:00:00Z'), signed_place: 'Recorded Town', accepted_at: '2026-10-04T12:00:00Z', evidence_digest: `synthetic-evidence-${index}` }))
  return { frozen, evidence, signingPack, approval }
}

test('completed FICA/disclosure show recorded signatures and branded evidence while preserving captured facts and source bytes', async () => {
  const { frozen, evidence } = await fixture()
  const original = structuredClone(frozen)
  for (const document of frozen.documents) {
    const final = applySellerDocumentSignatureEvidence(document.generatedHtml, evidence(document), document.versionDigest)
    const dom = new JSDOM(final), root = dom.window.document
    const cards = [...root.querySelectorAll('[data-recorded-seller-signature]')]
    assert.ok(cards.length > 0)
    for (const card of cards) {
      assert.match(card.textContent, /Signature recorded/)
      assert.match(card.textContent, /4 October 2026/)
      assert.match(card.textContent, /Recorded Town/)
      assert.equal(card.querySelectorAll('img').length, 1)
      assert.doesNotMatch(card.textContent, /Awaiting signature|Not signed yet/)
    }
    const pages = [...root.querySelectorAll('.seller-portal-signature-page')]
    assert.equal(pages.length, 1)
    assert.ok(pages[0].closest('.document, .property-disclosure-document'))
    assert.equal(pages[0].querySelectorAll('.doc-header img').length, 1)
    assert.equal(pages[0].querySelectorAll('.doc-footer').length, 1)
    assert.equal(pages[0].querySelectorAll('[data-signature-evidence]').length, 2)
    assert.match(pages[0].textContent, /Recorded signature evidence/)
    if (document.key === 'signed_fica_declaration') {
      assert.ok(final.includes('Awaiting signature — Page 3 of 99 (captured note)'), 'Captured prose must not be changed by status/number annotation')
      assert.match(final, /Not yet verified by the agency/)
    } else {
      assert.match(root.querySelector('.compliance-summary').textContent, /All 2 required signatures recorded/)
      assert.doesNotMatch(root.querySelector('.signature-section').textContent, /Original Signing Place/)
    }
    dom.window.close()
  }
  assert.deepEqual(frozen, original)
})

test('large signer rosters split branded evidence into bounded pages without losing recipients', async () => {
  const { frozen, evidence } = await fixture(6)
  for (const document of frozen.documents) {
    const dom = new JSDOM(applySellerDocumentSignatureEvidence(document.generatedHtml, evidence(document), document.versionDigest))
    const pages = [...dom.window.document.querySelectorAll('.seller-portal-signature-page')]
    assert.equal(pages.length, 3)
    assert.equal(dom.window.document.querySelectorAll('[data-signature-evidence]').length, 6)
    for (const page of pages) assert.equal(page.querySelectorAll('[data-signature-evidence]').length, 2)
    dom.window.close()
  }
})

test('historical mandates retain their wording and original header/footer style on the recorded evidence page', async () => {
  const { signingPack, approval, evidence } = await fixture()
  const selected = { ...approval, selectedDocuments: ['mandate'] }
  const prepared = createSellerOnboardingSigningCopyPack({ signingPack, formalPackApproval: selected, disclosureSigned: true })
  const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: prepared, formalPackApproval: selected, signingPack, actor: 'synthetic-reviewer' })
  const source = frozen.documents[0], original = source.generatedHtml
  const dom = new JSDOM(applySellerDocumentSignatureEvidence(original, evidence(source), source.versionDigest))
  const page = dom.window.document.querySelector('.seller-portal-signature-page')
  assert.ok(page.closest('.document'))
  assert.equal(page.querySelectorAll('.header img').length, 1)
  assert.equal(page.querySelectorAll('.footer').length, 1)
  assert.equal(dom.window.document.querySelectorAll('.clause').length, 7)
  assert.equal(source.generatedHtml, original)
  dom.window.close()
})

test('wrong versions, duplicate recipients, substituted signers and unsafe drawn values cannot produce final evidence', async () => {
  const { frozen, evidence } = await fixture()
  const document = frozen.documents.find(row => row.key === 'signed_fica_declaration')
  for (const mutate of [rows => { rows[0].document_version_digest = 'wrong-version' }, rows => { rows.push(rows[0]) },
    rows => { rows[0].signer_email = 'substitute@example.test' }, rows => { rows[0].signature_value = 'javascript:unsafe' }]) {
    const rows = evidence(document); mutate(rows)
    assert.throws(() => applySellerDocumentSignatureEvidence(document.generatedHtml, rows, document.versionDigest), /signature evidence|recorded signer/)
  }
  assert.throws(() => applySellerDocumentSignatureEvidence(document.generatedHtml, [], document.versionDigest), /Every required signer/)
})

test('typed historical evidence and signer-supplied text are escaped', async () => {
  const { frozen, evidence } = await fixture()
  const document = frozen.documents[0], rows = evidence(document)
  rows[0] = { ...rows[0], signature_type: 'typed', signature_value: '<img src=x onerror=alert(1)>', signed_place: '<script>unsafe</script>' }
  const dom = new JSDOM(applySellerDocumentSignatureEvidence(document.generatedHtml, rows, document.versionDigest))
  assert.equal(dom.window.document.querySelectorAll('script, img[src="x"]').length, 0)
  assert.match(dom.window.document.body.textContent, /<script>unsafe<\/script>/)
  dom.window.close()
})
