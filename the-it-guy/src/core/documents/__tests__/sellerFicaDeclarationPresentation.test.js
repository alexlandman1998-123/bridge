import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerCorrectionFixture } from '../../../../scripts/fixtures/seller-document-corrections.mjs'
import { buildSellerSigningCorrectionEditData, projectSellerSigningDocumentCorrections } from '../sellerSigningDocumentCorrections.js'
import { buildSellerFicaDueDiligenceMarkup } from '../sellerFicaDueDiligenceMarkup.js'
import { buildSellerComplianceDocumentModel } from '../sellerComplianceDocumentModel.js'
import { applySellerDocumentSignatureEvidence } from '../sellerDocumentSignatureEvidence.js'

for (const branch of ['individual', 'married', 'multiple_owners', 'foreign_individual', 'company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate', 'power_of_attorney', 'other']) {
  test(`${branch}: signing questions follow the frozen legal owner`, () => {
    const copy = createSellerCorrectionFixture(branch)
    // The signatory's name/identity must never turn a company into an individual.
    const edit = buildSellerSigningCorrectionEditData(copy, 'signed_fica_declaration', { fica: { industryOfBusiness: 'Legacy business question', employer: 'Legacy employer' } })
    assert.equal(edit.ficaProfileType, branch)
    assert.equal(Object.hasOwn(edit.fica, 'industryOfBusiness'), ['company', 'close_corporation', 'foreign_company', 'other'].includes(branch))
    assert.equal(Object.hasOwn(edit.fica, 'employer'), ['individual', 'married', 'multiple_owners', 'foreign_individual', 'power_of_attorney'].includes(branch))
    assert.equal(Object.hasOwn(edit.fica, 'heirInEstate'), branch === 'deceased_estate')
    assert.ok(Object.hasOwn(edit.fica, 'sourceOfIncome'))
    assert.ok(Object.hasOwn(edit.fica, 'politicallyInfluentialPerson'))
  })
}

test('inapplicable corrections cannot overwrite captured ownership facts', () => {
  const copy = createSellerCorrectionFixture('individual')
  copy.form.industryOfBusiness = 'Preserved historical capture'
  const edit = buildSellerSigningCorrectionEditData(copy, 'signed_fica_declaration')
  const projected = projectSellerSigningDocumentCorrections(copy, { ...edit, fica: { ...edit.fica, industryOfBusiness: 'Inapplicable submitted value' } })
  assert.equal(projected.form.industryOfBusiness, 'Preserved historical capture')
  assert.equal(copy.form.industryOfBusiness, 'Preserved historical capture')
  const model = buildSellerComplianceDocumentModel({ formData: projected.form })
  assert.ok(!model.ficaSections.some(section => section.rows.some(row => row.label === 'Industry of business')))
})

const signature = 'data:image/png;base64,' + 'a'.repeat(150)
const branding = { organisation_name: 'Test Agency', logo_light_url: 'https://example.test/logo.png' }
test('FICA document retains supplied signature, date, place and agency aliases', () => {
  const html = buildSellerFicaDueDiligenceMarkup({ signingPack: { seller: { name: 'Taylor Seller' }, signers: [
    { name: 'Taylor Seller', role: 'Seller', email: 'taylor@example.test', signature, signed_date: '2026-10-13', signed_place: 'Cape Town' },
  ] }, branding })
  assert.ok(html.includes(signature))
  assert.match(html, /13 October 2026/)
  assert.match(html, /Cape Town/)
  assert.match(html, /src="https:\/\/example.test\/logo.png"/)
  assert.doesNotMatch(html, /Times New Roman|Georgia|Awaiting signature/)
})

test('structured and absent signature values are normalized without inventing a signature', () => {
  for (const value of [null, { data_url: signature }]) {
    const html = buildSellerFicaDueDiligenceMarkup({ signingPack: { seller: { name: 'Taylor Seller' }, signers: [
      { name: 'Taylor Seller', email: 'taylor@example.test', signature: value, signed_date: value ? '2026-10-13' : '' },
    ] }, branding })
    assert.equal(html.includes(signature), Boolean(value))
    assert.equal(html.includes('Awaiting signature'), !value)
    assert.doesNotMatch(html, /\[object Object\]/)
  }
})

test('unsigned printable copy has lines; recorded evidence populates the signer panel without editing the source', () => {
  const html = buildSellerFicaDueDiligenceMarkup({ signingPack: { seller: { name: 'Taylor Seller' }, signers: [
    { name: 'Taylor Seller', role: 'Seller', email: 'taylor@example.test' },
  ] }, branding })
  const evidence = [{ signer_email: 'taylor@example.test', signed_name: 'Taylor Seller', signer_role: 'Seller',
    signature_type: 'drawn', signature_value: signature, signed_date: '2026-10-13', signed_place: 'Cape Town',
    document_version_digest: 'sha256:approved', evidence_digest: 'sha256:evidence', accepted_at: '2026-10-13T12:00:00Z' }]
  const signed = applySellerDocumentSignatureEvidence(html, evidence, 'sha256:approved')
  assert.match(html, /Awaiting signature/)
  assert.doesNotMatch(html, /data-recorded-seller-signature/)
  assert.match(signed, /data-recorded-seller-signature="taylor@example.test"/)
  assert.ok(signed.includes(signature))
  assert.match(signed, /13 October 2026/)
  assert.match(signed, /Cape Town/)
  assert.doesNotMatch(signed, /Awaiting signature|Not signed yet/)
  assert.throws(() => applySellerDocumentSignatureEvidence(html, evidence, 'sha256:stale'), /does not match/)
})
