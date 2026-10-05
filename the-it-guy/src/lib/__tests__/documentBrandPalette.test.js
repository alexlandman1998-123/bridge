import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDocumentBrandPalette } from '../onboardingBranding.js'
import { buildSellerMandateDocumentMarkup, buildSellerMandateDocumentModel } from '../../core/documents/sellerMandateDocumentMarkup.js'
import { buildSellerFicaDueDiligenceMarkup } from '../../core/documents/sellerFicaDueDiligenceMarkup.js'
import { buildPropertyDisclosureDocumentMarkup } from '../propertyDisclosure.js'
import { createSellerCorrectionFixture } from '../../../scripts/fixtures/seller-document-corrections.mjs'
import { createSellerReviewedDocumentVersions, verifySellerReviewedDocumentVersion } from '../../core/documents/sellerReviewedDocumentVersions.js'

const branding = { organisationName: 'Agency CI Test', primaryColour: '#38165e', accentColour: '#054f8c' }
const expected = resolveDocumentBrandPalette(branding)
function render(copy, key) {
  const pack = copy.pack.signingPackSnapshot
  return key === 'signed_mandate' ? buildSellerMandateDocumentMarkup({ signingPack: pack, approval: copy.approval })
    : key === 'signed_fica_declaration' ? buildSellerFicaDueDiligenceMarkup({ formData: copy.form, signingPack: pack, branding: pack.branding })
      : buildPropertyDisclosureDocumentMarkup(copy.form.propertyDisclosure, { branding: pack.branding, sellerName: pack.seller.name, propertyAddress: pack.property.address })
}

test('agency colour aliases, nested palettes and short hex values resolve consistently', () => {
  const alias = resolveDocumentBrandPalette({ corporate_identity: { primary_brand_color: '#38165e', accent_brand_color: '#054f8c' } })
  assert.deepEqual(alias, expected)
  assert.equal(resolveDocumentBrandPalette({ primaryColor: '#abc' }).primaryColour, '#aabbcc')
  assert.equal(resolveDocumentBrandPalette({ primaryColour: '#ABCDEF' }).primaryColour, '#ABCDEF', 'Preserve the representation of existing valid six-digit colours')
})

test('invalid or injected colours use safe defaults in every renderer', () => {
  const copy = createSellerCorrectionFixture()
  Object.assign(copy.pack.signingPackSnapshot.branding, { primaryColour: '</style><script>unsafe-colour</script>', accentColor: 'url(https://example.test/unsafe-colour)' })
  const fallback = resolveDocumentBrandPalette(copy.pack.signingPackSnapshot.branding)
  assert.equal(fallback.primaryColour, '#193d2e')
  for (const key of ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form']) {
    const html = render(copy, key)
    assert.ok(!html.includes('unsafe-colour'), key)
    assert.ok(html.includes(fallback.primaryColour), key)
  }
})

test('light agency colours retain the palette and produce readable document ink', () => {
  const palette = resolveDocumentBrandPalette({ primaryColour: '#ffffff', accentColour: '#ffff00' })
  assert.equal(palette.primaryColour, '#ffffff')
  assert.equal(palette.accentColour, '#ffff00')
  const contrast = colour => {
    const [red, green, blue] = [1, 3, 5].map(index => parseInt(colour.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return 1.05 / (0.2126 * red + 0.7152 * green + 0.0722 * blue + 0.05)
  }
  assert.ok(contrast(palette.primaryInk) >= 4.5)
  assert.ok(contrast(palette.accentInk) >= 4.5)
})

test('mandate, FICA and disclosure carry the same saved primary/accent palette', () => {
  const copy = createSellerCorrectionFixture('multiple_owners')
  Object.assign(copy.pack.signingPackSnapshot.branding, branding)
  const before = structuredClone(copy)
  for (const key of ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form']) {
    const html = render(copy, key)
    assert.ok(html.includes(expected.primaryColour), key)
    assert.ok(html.includes(expected.accentColour), key)
    assert.ok(html.includes('Agency CI Test'), key)
  }
  const model = buildSellerMandateDocumentModel({ signingPack: copy.pack.signingPackSnapshot, approval: copy.approval })
  assert.equal(model.primaryColour, expected.primaryColour)
  assert.equal(model.accentColour, expected.accentColour)
  assert.deepEqual(copy, before, 'Brand rendering cannot rewrite captured facts or historical copies')
})

test('a later agency palette cannot rewrite an already-approved document or its hash', async () => {
  const copy = createSellerCorrectionFixture()
  const approval = { ...copy.approval, signingRoute: 'digital_pack', selectedDocuments: ['fica', 'mandate'] }
  const frozen = await createSellerReviewedDocumentVersions({ manualSigningPack: { documents: ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form'].map(key => ({ key, generatedHtml: render(copy, key) })) },
    formalPackApproval: approval, signingPack: copy.pack.signingPackSnapshot, actor: 'synthetic-agent' })
  const saved = structuredClone(frozen)
  Object.assign(copy.pack.signingPackSnapshot.branding, branding)
  for (const document of frozen.documents) {
    assert.equal(await verifySellerReviewedDocumentVersion(document), true)
    assert.notEqual(render(copy, document.key), document.generatedHtml, 'New palette requires new rendered content for review')
  }
  assert.deepEqual(frozen, saved)
})
