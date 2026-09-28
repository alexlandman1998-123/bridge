import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerMandateDocumentMarkup } from '../sellerMandateDocumentMarkup.js'

const base = {
  signingPack: {
    branding: { organisationName: 'Harbour & Home', logoUrl: 'https://example.test/harbour-logo.png' },
    seller: { name: 'Sam Seller', idNumber: '8001015009087', residentialAddress: '2 Oak Road', email: 'sam@example.test' },
    property: { address: '10 Bay Road', titleDeedNumber: 'T123/2020' },
    mandate: { mandateType: 'sole', askingPrice: 'R 2 000 000', startDate: '2026-09-27', endDate: '2026-12-27', protectionPeriodDays: '180' },
    signers: [{ name: 'Sam Seller', role: 'Seller' }],
  },
  approval: { commission: { basis: 'percentage', percentage: '5', vatHandling: 'inclusive' } },
  generatedAt: '2026-09-27T12:00:00Z',
}

test('exclusive copy carries agency branding, property, commission and explicit exclusivity', () => {
  const html = buildSellerMandateDocumentMarkup(base)
  assert.match(html, /Harbour &amp; Home/)
  assert.match(html, /harbour-logo\.png/)
  assert.match(html, /10 Bay Road/)
  assert.match(html, /5% of the purchase price \(VAT included\)/)
  assert.match(html, /sole agency authorised/)
  assert.match(html, /180 calendar days after expiry/)
  assert.doesNotMatch(html, /Arch9/)
})

test('open copy does not inherit exclusive commission language', () => {
  const html = buildSellerMandateDocumentMarkup({
    ...base,
    signingPack: { ...base.signingPack, mandate: { ...base.signingPack.mandate, mandateType: 'open', protectionPeriodDays: '' } },
  })
  assert.match(html, /non-exclusive basis/)
  assert.match(html, /effective cause of a binding sale/)
  assert.match(html, /No post-mandate introduced-buyer protection period applies/)
  assert.doesNotMatch(html, /sole agency authorised/)
})

test('dual copy names the other agency and refuses an unnamed dual appointment', () => {
  assert.throws(() => buildSellerMandateDocumentMarkup({
    ...base,
    signingPack: { ...base.signingPack, mandate: { ...base.signingPack.mandate, mandateType: 'dual' } },
  }), /second agency/)
  const html = buildSellerMandateDocumentMarkup({
    ...base,
    signingPack: { ...base.signingPack, mandate: { ...base.signingPack.mandate, mandateType: 'dual', otherAgencyName: 'Second Agency' } },
  })
  assert.match(html, /Second Agency/)
  assert.match(html, /two agencies authorised/)
})

test('separate co-owners with the same name keep their own identity rows and signatures', () => {
  const html = buildSellerMandateDocumentMarkup({
    ...base,
    signingPack: {
      ...base.signingPack,
      seller: { ...base.signingPack.seller, parties: [
        { name: 'Sam Seller', idNumber: '8001015009087', role: 'Seller' },
        { name: 'Sam Seller', idNumber: '8101015009088', residentialAddress: '4 Cedar Road', role: 'Seller' },
      ] },
      signers: [{ name: 'Sam Seller', role: 'Seller 1' }, { name: 'Sam Seller', role: 'Seller 2' }],
    },
  })
  assert.match(html, /Additional seller 1/)
  assert.match(html, /8101015009088/)
  assert.match(html, /4 Cedar Road/)
  assert.match(html, /Seller 2/)
})

test('unclear prime route cannot silently receive exclusive or open wording', () => {
  assert.throws(() => buildSellerMandateDocumentMarkup({
    ...base,
    signingPack: { ...base.signingPack, mandate: { ...base.signingPack.mandate, mandateType: 'prime' } },
  }), /Confirm the meaning/)
})

test('mandate preparation refuses an unknown agency rather than printing platform branding', () => {
  assert.throws(() => buildSellerMandateDocumentMarkup({
    ...base,
    signingPack: { ...base.signingPack, branding: {} },
  }), /agency name/)
})
