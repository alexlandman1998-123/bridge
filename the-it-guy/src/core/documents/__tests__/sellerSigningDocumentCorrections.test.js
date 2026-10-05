import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerCorrectionFixture, sellerCorrectionValues } from '../../../../scripts/fixtures/seller-document-corrections.mjs'
import { buildSellerSigningCorrectionEditData, projectSellerSigningDocumentCorrections, renderSellerSigningDocumentCorrections, validateSellerSigningDocumentCorrections } from '../sellerSigningDocumentCorrections.js'
import { buildSellerMandateDocumentModel } from '../sellerMandateDocumentMarkup.js'

const keys = ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form']
function deepFreeze(value) {
  Object.freeze(value)
  Object.values(value).forEach(child => { if (child && typeof child === 'object') deepFreeze(child) })
  return value
}

for (const key of keys) test(`${key}: corrected name, identity and property replace the original facts`, () => {
  const copy = createSellerCorrectionFixture()
  const html = renderSellerSigningDocumentCorrections(copy, key, sellerCorrectionValues(copy, key), 'fixture-listing')
  for (const value of ['Corrected Primary', 'CORRECTED-ID', 'Corrected Property Address']) assert.ok(html.includes(value), value)
  for (const value of ['Original Primary', 'ORIGINAL-ID', 'Original Property Address']) assert.ok(!html.includes(value), value)
  if (key === 'signed_fica_declaration') {
    assert.ok(html.includes('CORRECTED-TAX')); assert.ok(!html.includes('ORIGINAL-TAX'))
    assert.ok(html.includes('Corrected Occupation')); assert.ok(!html.includes('Original Occupation'))
    assert.ok(html.includes('Corrected Funds')); assert.ok(!html.includes('Original Funds'))
    assert.ok(html.includes('Frozen agency declaration wording.'))
  }
})

for (const key of keys) test(`${key}: preserves all co-owners and uses the corrected primary identity once`, () => {
  const copy = createSellerCorrectionFixture('multiple_owners')
  const values = sellerCorrectionValues(copy, key)
  const html = renderSellerSigningDocumentCorrections(copy, key, values, 'fixture-listing')
  for (const value of ['Corrected Primary', 'CORRECTED-ID', 'Second Owner', 'SECOND-OWNER-ID']) assert.ok(html.includes(value), value)
  assert.ok(!html.includes('Original Primary')); assert.ok(!html.includes('ORIGINAL-ID'))
  if (key === 'signed_mandate') {
    const { pack } = projectSellerSigningDocumentCorrections(copy, values)
    const model = buildSellerMandateDocumentModel({ signingPack: pack, approval: copy.approval })
    assert.equal(model.sellerName, 'Corrected Primary')
    assert.deepEqual(model.coOwners.map(owner => owner.name), ['Second Owner'])
  }
  if (key === 'signed_disclosure_form') {
    assert.match(html, /Signature evidence for this property disclosure/)
    assert.match(html, /FICA and the mandate are signed separately/)
    assert.ok(!html.includes('HISTORIC-SOURCE-SIGNATURE'))
  }
})

test('same-name owners are matched by their original recipient email rather than array position', () => {
  const copy = createSellerCorrectionFixture('multiple_owners')
  const first = copy.pack.signingPackSnapshot.seller.parties[0]
  copy.pack.signingPackSnapshot.seller.parties[1].name = first.name
  copy.pack.signingPackSnapshot.seller.parties[1].firstName = first.firstName
  copy.pack.signingPackSnapshot.seller.parties[1].surname = first.surname
  copy.pack.signingPackSnapshot.seller.parties.reverse()
  const values = sellerCorrectionValues(copy, 'signed_mandate')
  const { pack } = projectSellerSigningDocumentCorrections(copy, values)
  assert.equal(pack.seller.parties[0].idNumber, 'SECOND-OWNER-ID')
  assert.equal(pack.seller.parties[0].name, 'Original Primary')
  assert.equal(pack.seller.parties[1].idNumber, 'CORRECTED-ID')
})

for (const branch of ['company', 'close_corporation', 'foreign_company', 'trust', 'foreign_trust', 'deceased_estate', 'power_of_attorney', 'other']) {
  test(`${branch}: corrects the representative without changing the legal owner or authority`, () => {
    const copy = createSellerCorrectionFixture(branch)
    const original = copy.pack.signingPackSnapshot.seller
    for (const key of keys) {
      const values = sellerCorrectionValues(copy, key)
      const { pack } = projectSellerSigningDocumentCorrections(copy, values)
      assert.equal(pack.seller.legalOwnerName, original.legalOwnerName)
      assert.equal(pack.seller.legalOwnerIdentity, original.legalOwnerIdentity)
      assert.equal(pack.signers[0].name, 'Corrected Primary')
      assert.equal(pack.signers[0].email, copy.signers[0].email, 'Contact corrections cannot reroute a signing invitation')
      assert.deepEqual(pack.signers.slice(1), copy.signers.slice(1))
      for (const person of pack.seller.parties) assert.ok(person.authorityBasis, 'Captured authority must survive')
      const html = renderSellerSigningDocumentCorrections(copy, key, values, 'fixture-listing')
      assert.ok(html.includes('Corrected Primary'))
      assert.ok(html.includes(original.legalOwnerName), 'The legal entity/principal must still appear')
      assert.ok(!html.includes('Original Primary'), 'Old representative names must not reappear')
    }
  })
}

test('foreign passports and married seller details survive correction', () => {
  for (const branch of ['foreign_individual', 'married']) {
    const copy = createSellerCorrectionFixture(branch)
    const html = renderSellerSigningDocumentCorrections(copy, 'signed_fica_declaration', sellerCorrectionValues(copy, 'signed_fica_declaration'), 'fixture-listing')
    assert.ok(html.includes('CORRECTED-ID')); assert.ok(!html.includes('ORIGINAL-ID'))
    assert.ok(html.includes(branch === 'married' ? 'SECOND-OWNER-ID' : 'Foreign nationality'))
  }
})

test('every FICA field offered by the correction editor reaches the regenerated record', () => {
  for (const branch of ['individual', 'company']) {
    const copy = createSellerCorrectionFixture(branch)
    const edit = buildSellerSigningCorrectionEditData(copy, 'signed_fica_declaration')
    const fica = Object.fromEntries(Object.keys(edit.fica).map(field => [field, `CORRECTED_${field}`]))
    const values = sellerCorrectionValues(copy, 'signed_fica_declaration', { fica })
    const html = renderSellerSigningDocumentCorrections(copy, 'signed_fica_declaration', values, 'fixture-listing').toLowerCase()
    for (const value of Object.values(fica)) assert.ok(html.includes(value.replaceAll('_', ' ').toLowerCase()) || html.includes(value.toLowerCase()), `${branch}: ${value}`)
  }
})

test('captured facts and wording held only in an older FICA model are retained', () => {
  const copy = createSellerCorrectionFixture()
  copy.form.sellerPostOnboardingDrafts.documents[0].metadata.ficaDeclarationModel.sections.push({ title: 'Supporting documents', rows: [{ label: 'Authority reference', value: 'PRESERVED-AUTHORITY-REFERENCE' }] })
  const html = renderSellerSigningDocumentCorrections(copy, 'signed_fica_declaration', sellerCorrectionValues(copy, 'signed_fica_declaration'), 'fixture-listing')
  assert.ok(html.includes('PRESERVED-AUTHORITY-REFERENCE'))
  assert.ok(html.includes('Frozen agency declaration wording.'))
})

test('older forms recover owner, director and trustee rosters from the frozen signing snapshot', () => {
  for (const [branch, collection] of [['multiple_owners', 'multipleOwners'], ['company', 'companyDirectors'], ['trust', 'trustees']]) {
    const copy = createSellerCorrectionFixture(branch)
    delete copy.form[collection]
    const html = renderSellerSigningDocumentCorrections(copy, 'signed_fica_declaration', sellerCorrectionValues(copy, 'signed_fica_declaration'), 'fixture-listing')
    assert.ok(html.includes('SECOND-OWNER-ID'), `${branch}: retain the second person's identity`)
    assert.ok(html.includes('CORRECTED-ID'), `${branch}: replace the first person's identity`)
    assert.ok(!html.includes('Original Primary'), `${branch}: do not revive old roster names`)
  }
})

test('cleared entity signatory identities cannot be revived from a frozen FICA row', () => {
  for (const branch of ['company', 'trust']) {
    const copy = createSellerCorrectionFixture(branch)
    const html = renderSellerSigningDocumentCorrections(copy, 'signed_fica_declaration', sellerCorrectionValues(copy, 'signed_fica_declaration', { common: { idNumber: '' } }), 'fixture-listing')
    assert.ok(!html.includes('ORIGINAL-ID'), branch)
    assert.ok(html.includes('SECOND-OWNER-ID'), branch)
  }
})

test('explicitly cleared fields cannot resurrect stale aliases or frozen FICA rows', () => {
  const copy = createSellerCorrectionFixture()
  Object.assign(copy.form, { income_tax_number: 'ORIGINAL-TAX', taxNumber: 'ORIGINAL-TAX', sellerEmail: 'old-alias@example.test', sellerResidentialAddress: 'Original Home Address' })
  const values = sellerCorrectionValues(copy, 'signed_fica_declaration', { common: { idNumber: '', residentialAddress: '', email: '', phone: '' }, fica: { incomeTaxNumber: '', sourceOfIncome: '', occupation: '' } })
  const html = renderSellerSigningDocumentCorrections(copy, 'signed_fica_declaration', values, 'fixture-listing')
  for (const value of ['ORIGINAL-TAX', 'ORIGINAL-ID', 'Original Home Address', 'Original Funds', 'Original Occupation', 'old-alias@example.test']) assert.ok(!html.includes(value), value)
})

test('mandate corrections use the new commission, zero protection and cleared conditions', () => {
  const copy = createSellerCorrectionFixture()
  const values = sellerCorrectionValues(copy, 'signed_mandate', { mandate: { commissionBasis: 'fixed', commissionAmount: '12345', vatHandling: 'exclusive', protectionPeriod: '0', specialConditions: '' } })
  const html = renderSellerSigningDocumentCorrections(copy, 'signed_mandate', values, 'fixture-listing')
  assert.ok(html.includes('R 12345 plus VAT'))
  assert.ok(!html.includes('90 calendar days'))
  assert.ok(!html.includes('Original special conditions')); assert.ok(!html.includes('Original legacy conditions'))
})

test('dual mandate corrections retain both agencies; unsupported variants and missing agencies fail', () => {
  const copy = createSellerCorrectionFixture()
  copy.pack.signingPackSnapshot.mandate.mandateType = 'dual_mandate'
  copy.pack.signingPackSnapshot.mandate.otherAgencyName = 'Second Agency'
  const values = sellerCorrectionValues(copy, 'signed_mandate')
  assert.equal(values.mandate.mandateType, 'dual')
  assert.equal(buildSellerSigningCorrectionEditData(copy, 'signed_mandate', { mandate: { mandateType: 'exclusive' } }).mandate.mandateType, 'sole', 'Saved legacy variants must match an available editor choice')
  const html = renderSellerSigningDocumentCorrections(copy, 'signed_mandate', values, 'fixture-listing')
  assert.ok(html.includes('Second Agency')); assert.ok(html.includes('Correction Test Agency'))
  assert.throws(() => validateSellerSigningDocumentCorrections({ ...values, mandate: { ...values.mandate, otherAgencyName: '' } }, 'signed_mandate'), /second agency/)
  assert.throws(() => validateSellerSigningDocumentCorrections({ ...values, mandate: { ...values.mandate, mandateType: 'prime' } }, 'signed_mandate'), /approved wording/)
})

test('disclosure corrections clear old comments and signature marks, preserve zero and escape text', () => {
  const copy = createSellerCorrectionFixture('multiple_owners')
  copy.form.propertyDisclosure.sellerWitness1 = 'OLD-WITNESS'
  const values = sellerCorrectionValues(copy, 'signed_disclosure_form', { disclosure: { comments: '', remoteControlsQuantity: 0,
    responses: { ...copy.form.propertyDisclosure.responses, roof_leaks: { answer: 'yes', note: 'CORRECTED-NOTE <script>unsafe</script>' } } } })
  const html = renderSellerSigningDocumentCorrections(copy, 'signed_disclosure_form', values, 'fixture-listing')
  assert.ok(!html.includes('Original disclosure comment')); assert.ok(!html.includes('OLD-WITNESS')); assert.ok(!html.includes('HISTORIC-SOURCE-SIGNATURE'))
  assert.ok(html.includes('CORRECTED-NOTE &lt;script&gt;unsafe&lt;/script&gt;'))
  assert.ok(!html.includes('<script>unsafe</script>'))
  assert.equal(values.disclosure.remoteControlsQuantity, '0')
})

test('repeated correction rendering is deterministic and cannot mutate approved copies or historical evidence', () => {
  const copy = deepFreeze(createSellerCorrectionFixture('multiple_owners'))
  const before = JSON.stringify(copy)
  for (const key of keys) {
    const values = sellerCorrectionValues(copy, key)
    assert.equal(renderSellerSigningDocumentCorrections(copy, key, values, 'fixture-listing'), renderSellerSigningDocumentCorrections(copy, key, values, 'fixture-listing'))
    assert.equal(JSON.stringify(copy), before)
  }
})

test('Open corrections record an indefinite appointment without an old end date returning', () => {
  const copy = createSellerCorrectionFixture()
  const before = structuredClone(copy)
  const values = sellerCorrectionValues(copy, 'signed_mandate', { mandate: { mandateType: 'open_mandate', mandateDuration: 'until_cancelled', endDate: '2027-01-04' } })
  assert.equal(values.mandate.mandateType, 'open')
  assert.equal(values.mandate.endDate, '')
  const html = renderSellerSigningDocumentCorrections(copy, 'signed_mandate', values, 'fixture-listing')
  assert.match(html, /Until cancelled in writing/)
  assert.deepEqual(copy, before)
})

test('corrections reject impossible dates, excessive percentages and missing protection instructions', () => {
  const copy = createSellerCorrectionFixture()
  for (const mandate of [{ startDate: '2026-02-29' }, { endDate: '2026-09-31' }, { protectionPeriod: '' }, { commissionPercentage: '101' }]) {
    assert.throws(() => sellerCorrectionValues(copy, 'signed_mandate', { mandate }), /Complete valid mandate terms/)
  }
})
