import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingManualSigningPack } from '../sellerOnboardingManualSigningPack.js'
import { buildSellerPostOnboardingDrafts } from '../sellerPostOnboardingDrafts.js'

test('creates distinct disclosure, FICA and mandate signing copies from reviewed facts', () => {
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
    signingPack: { seller: { name: 'Alex Seller', idNumber: '123' }, signers: [{ name: 'Alex Seller', role: 'Seller' }], mandate: { propertyAddress: '1 Test Road', askingPrice: 'R 1 000 000', mandateType: 'sole', specialConditions: 'No early termination' } },
    postOnboardingDrafts: { documents: [
      { key: 'signed_disclosure_form', targetRequirementKey: 'signed_disclosure_form', generatedHtml: '<article>Disclosure</article>' },
      { key: 'fica_review_draft', targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' },
    ] },
    generatedAt: '2026-09-19T11:00:00.000Z',
  })
  assert.equal(pack.status, 'awaiting_signed_hard_copy')
  assert.deepEqual(pack.documents.map((document) => document.key), ['signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate'])
  assert.match(pack.documents[2].generatedHtml, /No early termination/)
  assert.match(pack.documents[2].generatedHtml, /Alex Seller.*Seller.*signature and date/)
})

test('does not create another disclosure copy when onboarding already captured every signature', () => {
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { basis: 'fixed', amount: '10000', vatHandling: 'inclusive' } },
    signingPack: { seller: { name: 'Alex Seller' }, mandate: {} },
    postOnboardingDrafts: { documents: [{ key: 'fica_review_draft', targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] },
    disclosureSigned: true,
  })
  assert.deepEqual(pack.documents.map((document) => document.key), ['signed_fica_declaration', 'signed_mandate'])
})

test('reviewed FICA copy uses every approved co-owner signer without reusing onboarding signatures', () => {
  const formData = {
    sellerType: 'multiple_owners',
    multipleOwners: [{ fullName: 'Alex Seller', email: 'alex@example.com' }, { fullName: 'Pat Seller', email: 'pat@example.com' }],
  }
  const drafts = buildSellerPostOnboardingDrafts({ formData, listing: { id: 'listing-coowners' }, generatedAt: '2026-09-27T12:00:00Z' })
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
    signingPack: { seller: { name: 'Alex and Pat Seller' }, signers: [{ name: 'Alex Seller', role: 'Owner' }, { name: 'Pat Seller', role: 'Owner' }], mandate: {} },
    postOnboardingDrafts: drafts,
  })
  const ficaHtml = pack.documents.find((document) => document.key === 'signed_fica_declaration').generatedHtml
  assert.match(ficaHtml, /Alex Seller/)
  assert.match(ficaHtml, /Pat Seller/)
  assert.doesNotMatch(ficaHtml, /Signature capture is completed in the onboarding step/)
  assert.match(ficaHtml, /Awaiting signature/)
})

test('does not create physical copies before manual-route approval', () => {
  assert.throws(() => createSellerOnboardingManualSigningPack({ formalPackApproval: { status: 'approved', signingRoute: 'digital_pack' } }), /manual signing route/)
})

test('retains a previous frozen signing copy when an agent prepares a replacement', () => {
  const pack = createSellerOnboardingManualSigningPack({
    existing: { generatedAt: '2026-09-20T10:00:00Z', documents: [{ key: 'signed_mandate', versionId: 'old-v1', generatedHtml: '<article>Previous approved terms</article>' }] },
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { confirmed: true } },
    signingPack: { seller: { name: 'Alex Seller' }, mandate: {} },
    postOnboardingDrafts: { documents: [{ targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] },
    disclosureSigned: true,
  })
  assert.equal(pack.versionHistory[0].documents[0].versionId, 'old-v1')
  assert.match(pack.versionHistory[0].documents[0].generatedHtml, /Previous approved terms/)
})
