import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingManualSigningPack } from '../sellerOnboardingManualSigningPack.js'

test('creates printable FICA and mandate copies that remain awaiting wet-ink upload', () => {
  const pack = createSellerOnboardingManualSigningPack({
    formalPackApproval: { status: 'approved', signingRoute: 'manual_upload', commission: { basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
    signingPack: { seller: { name: 'Alex Seller', idNumber: '123' }, mandate: { propertyAddress: '1 Test Road', askingPrice: 'R 1 000 000', mandateType: 'sole' } },
    postOnboardingDrafts: { documents: [{ key: 'fica_review_draft', targetRequirementKey: 'signed_fica_declaration', generatedHtml: '<article>FICA</article>' }] },
    generatedAt: '2026-09-19T11:00:00.000Z',
  })
  assert.equal(pack.status, 'awaiting_signed_hard_copy')
  assert.deepEqual(pack.documents.map((document) => document.key), ['signed_fica_declaration', 'signed_mandate'])
  assert.match(pack.documents[1].generatedHtml, /physical-signing copy/i)
  assert.match(pack.documents[1].generatedHtml, /Alex Seller/)
})

test('does not create physical copies before manual-route approval', () => {
  assert.throws(() => createSellerOnboardingManualSigningPack({ formalPackApproval: { status: 'approved', signingRoute: 'digital_pack' } }), /manual signing route/)
})
