import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'

function normalizeWhitespace(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:document-generation-canonical-fields-phase3'],
  'node scripts/document-generation-canonical-fields-phase3.test.mjs',
  'package.json should expose the document generation canonical fields Phase 3 contract.',
)

const mandateData = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    status: 'submitted',
    seller: {
      legal_type: 'company',
      company: {
        name: 'Queens Cres Holdings (Pty) Ltd',
        registration_number: '2024/123456/07',
        authorised_signatory: {
          name: 'Alex Director',
          capacity: 'Director',
        },
        resolution_date: '2026-08-01',
        authority_basis: 'Board resolution',
      },
    },
    property: {
      structure_type: 'sectional_title',
      category: 'residential',
      address: {
        line_1: '409 Queens Cres',
        suburb: 'Lynnwood',
        city: 'Pretoria',
        postal_code: '0081',
      },
      scheme: {
        unit_number: '12',
        section_number: '34',
        name: 'Queens Cres Scheme',
      },
    },
    propertyDisclosure: {
      decision: 'none',
      declarationAccepted: true,
      signature: 'Alex Director',
      signedAt: '2026-08-01T08:00:00.000Z',
      comments: 'No known defects disclosed.',
    },
  },
})

assert.equal(mandateData.placeholders.seller_full_name, 'Queens Cres Holdings (Pty) Ltd')
assert.equal(mandateData.placeholders.seller_company_registration_number, '2024/123456/07')
assert.equal(mandateData.placeholders.seller_representative_name, 'Alex Director')
assert.equal(mandateData.placeholders.seller_representative_capacity, 'Director')
assert.equal(mandateData.placeholders.seller_resolution_date, '2026-08-01')
assert.equal(mandateData.placeholders.seller_authority_basis, 'Board resolution')
assert.equal(mandateData.placeholders.property_title_type, 'sectional_title')
assert.equal(mandateData.placeholders.property_address, '409 Queens Cres')
assert.equal(mandateData.placeholders.property_suburb, 'Lynnwood')
assert.equal(mandateData.placeholders.property_city, 'Pretoria')
assert.equal(mandateData.placeholders.property_postal_code, '0081')
assert.equal(mandateData.placeholders.property_unit_number, '12')
assert.equal(mandateData.placeholders.property_section_number, '34')
assert.equal(mandateData.placeholders.property_complex_name, 'Queens Cres Scheme')
assert.equal(mandateData.placeholders.mandatory_disclosure_annexure, 'Declaration by Seller - Annexure A')
assert.equal(mandateData.placeholders.property_disclosure_annexure, 'Declaration by Seller - Annexure A')
assert.equal(mandateData.placeholders.mandatory_disclosure_status, 'complete')
assert.equal(mandateData.placeholders.property_disclosure_comments, 'No known defects disclosed.')
assert.equal(mandateData.placeholders.annexures_list, 'Declaration by Seller - Annexure A')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { resolveOtpPacketPlaceholders } = await server.ssrLoadModule('/src/core/documents/packetWorkflow.js')
  const otpPlaceholders = resolveOtpPacketPlaceholders({
    transaction: {
      finance_type: 'bond',
      purchase_price: '',
      property_address_line_1: '',
    },
    onboardingFormData: {
      buyer: {
        legal_type: 'individual',
        person: {
          first_name: 'Jordan',
          last_name: 'Buyer',
          identity_number_or_passport_number: '9001015009088',
          marital_status: 'married',
          marital_regime: 'in_community',
          email: 'jordan@example.test',
        },
      },
      finance: {
        purchase_price: '12000000',
        bond_amount: '9000000',
      },
      property: {
        structure_type: 'sectional_title',
        address: {
          line_1: '409 Queens Cres',
          suburb: 'Lynnwood',
          city: 'Pretoria',
          postal_code: '0081',
        },
        scheme: {
          unit_number: '12',
          section_number: '34',
          name: 'Queens Cres Scheme',
        },
      },
    },
    propertyDisclosureAnnexure: {
      title: 'Declaration by Seller - Annexure A',
      status: 'complete',
      comments: 'No known defects disclosed.',
      lockedAt: '2026-08-01T08:00:00.000Z',
      finalSignedFilePath: 'seller-disclosure-annexure-a.pdf',
    },
  })

  assert.equal(otpPlaceholders.buyer_full_name, 'Jordan Buyer')
  assert.equal(otpPlaceholders.buyer_marital_regime, 'in_community')
  assert.equal(otpPlaceholders.property_title_type, 'sectional_title')
  assert.equal(otpPlaceholders.property_address, '409 Queens Cres')
  assert.equal(otpPlaceholders.property_suburb, 'Lynnwood')
  assert.equal(otpPlaceholders.property_city, 'Pretoria')
  assert.equal(otpPlaceholders.property_postal_code, '0081')
  assert.equal(otpPlaceholders.property_unit_number, '12')
  assert.equal(otpPlaceholders.property_section_number, '34')
  assert.equal(otpPlaceholders.property_complex_name, 'Queens Cres Scheme')
  assert.equal(normalizeWhitespace(otpPlaceholders.purchase_price), 'R 12 000 000')
  assert.equal(normalizeWhitespace(otpPlaceholders.bond_amount), 'R 9 000 000')
  assert.equal(otpPlaceholders.mandatory_disclosure_annexure, 'Declaration by Seller - Annexure A')
  assert.equal(otpPlaceholders.property_disclosure_annexure, 'Declaration by Seller - Annexure A')
  assert.equal(otpPlaceholders.mandatory_disclosure_status, 'complete')
  assert.equal(otpPlaceholders.property_disclosure_comments, 'No known defects disclosed.')
  assert.equal(otpPlaceholders.annexures_list, 'Declaration by Seller - Annexure A')
} finally {
  await server.close()
}

console.log('Document generation canonical fields Phase 3 contract passed.')
