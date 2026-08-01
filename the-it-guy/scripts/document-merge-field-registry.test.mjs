import assert from 'node:assert/strict'
import { createServer } from 'vite'

import {
  listCanonicalMergeFields,
  resolveCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from '../src/core/documents/mergeFieldRegistry.js'

function assertNoUnknownTokens(tokens, packetType) {
  const validation = validateTemplateTokensAgainstRegistry({ tokens, packetType })
  assert.deepEqual(
    validation.unknown,
    [],
    `${packetType} should recognise ${tokens.map((token) => `{{${token}}}`).join(', ')}`,
  )
}

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const otpFieldKeys = new Set(listCanonicalMergeFields({ packetType: 'otp' }).map((field) => field.key))
const mandateFieldKeys = new Set(listCanonicalMergeFields({ packetType: 'mandate' }).map((field) => field.key))

for (const key of ['seller_email', 'seller_phone']) {
  assert.equal(otpFieldKeys.has(key), true, `OTP merge-field registry should include ${key}.`)
}

for (const key of ['erf_number', 'erf_size', 'floor_size']) {
  assert.equal(mandateFieldKeys.has(key), true, `Mandate merge-field registry should include ${key}.`)
}

assertNoUnknownTokens(['seller_email', 'seller_phone'], 'otp')
assertNoUnknownTokens(['erf_number', 'erf_size', 'floor_size'], 'mandate')
assertNoUnknownTokens(
  ['buyer_full_name', 'buyer_id_number', 'buyer_email', 'buyer_phone', 'buyer_domicilium_address'],
  'otp',
)
assert.equal(resolveCanonicalMergeFieldKey('buyer.person.identity_number_or_passport_number', { packetType: 'otp' }), 'buyer_id_number')
assert.equal(resolveCanonicalMergeFieldKey('buyer.company.registration_number', { packetType: 'otp' }), 'buyer_company_registration_number')
assert.equal(resolveCanonicalMergeFieldKey('buyer.trust.registration_number', { packetType: 'otp' }), 'buyer_trust_registration_number')
assert.equal(resolveCanonicalMergeFieldKey('buyer.person.spouse_identity_number', { packetType: 'otp' }), 'buyer_spouse_id_number')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { validatePacketPlaceholders } = await server.ssrLoadModule('/src/core/documents/packetWorkflow.js')
  const mandateValidation = validatePacketPlaceholders({
    packetType: 'mandate',
    placeholders: {},
    sectionManifest: [
      {
        key: 'parties',
        label: 'Parties',
        required: true,
        placeholders: [
          ['seller_full_name', 'Seller Full Name'],
          ['seller_trust_registration_number', 'Seller Trust Registration Number'],
        ],
      },
    ],
  })

  const sellerNameWarning = mandateValidation.warnings.find((warning) => warning.placeholderKey === 'seller_full_name')
  const trustRegistrationWarning = mandateValidation.warnings.find((warning) => warning.placeholderKey === 'seller_trust_registration_number')

  assert.equal(sellerNameWarning?.message, 'Missing Seller Full Name.')
  assert.equal(sellerNameWarning?.required, true)
  assert.equal(trustRegistrationWarning?.message, 'Optional Seller Trust Registration Number.')
  assert.equal(trustRegistrationWarning?.required, false)

  const { resolveOtpPacketPlaceholders } = await server.ssrLoadModule('/src/core/documents/packetWorkflow.js')
  const structuredIndividualOtp = resolveOtpPacketPlaceholders({
    transaction: { finance_type: 'bond', purchase_price: 2500000 },
    buyer: {},
    onboardingFormData: {
      buyer: {
        legal_type: 'individual',
        person: {
          first_name: 'Jordan',
          last_name: 'Buyer',
          identity_number_or_passport_number: '9001015009088',
          email: 'jordan@example.test',
          phone: '0820000000',
          marital_status: 'married',
          marital_regime: 'in_community',
          spouse_full_name: 'Taylor Buyer',
          spouse_identity_number: '9102025009088',
          spouse_email: 'taylor@example.test',
          spouse_consent_required: 'yes',
          residential_address: {
            line_1: '1 Buyer Street',
            suburb: 'Lynnwood',
            city: 'Pretoria',
            postal_code: '0081',
          },
        },
      },
      finance: {
        bond_amount: '2250000',
        cash_amount: '250000',
      },
    },
  })
  assert.equal(structuredIndividualOtp.buyer_full_name, 'Jordan Buyer')
  assert.equal(structuredIndividualOtp.buyer_id_number, '9001015009088')
  assert.equal(structuredIndividualOtp.buyer_email, 'jordan@example.test')
  assert.equal(structuredIndividualOtp.buyer_phone, '0820000000')
  assert.equal(structuredIndividualOtp.buyer_marital_regime, 'in_community')
  assert.equal(structuredIndividualOtp.buyer_spouse_id_number, '9102025009088')
  assert.equal(structuredIndividualOtp.buyer_domicilium_address, '1 Buyer Street, Lynnwood, Pretoria, 0081')
  assert.equal(normalizeWhitespace(structuredIndividualOtp.bond_amount), 'R 2 250 000')
  assert.equal(normalizeWhitespace(structuredIndividualOtp.cash_amount), 'R 250 000')

  const structuredCompanyOtp = resolveOtpPacketPlaceholders({
    transaction: { finance_type: 'cash', purchase_price: 12000000 },
    onboardingFormData: {
      buyer: {
        legal_type: 'company',
        company: {
          company_name: 'Acme Buyers Pty Ltd',
          company_registration_number: '2024/123456/07',
          authorised_signatory: {
            name: 'Alex Director',
            capacity: 'Director',
            email: 'alex.director@example.test',
          },
          resolution_date: '2026-08-01',
          authority_basis: 'Board resolution',
        },
      },
    },
  })
  assert.equal(structuredCompanyOtp.buyer_full_name, 'Acme Buyers Pty Ltd')
  assert.equal(structuredCompanyOtp.buyer_id_number, '2024/123456/07')
  assert.equal(structuredCompanyOtp.buyer_company_registration_number, '2024/123456/07')
  assert.equal(structuredCompanyOtp.buyer_representative_name, 'Alex Director')
  assert.equal(structuredCompanyOtp.buyer_representative_capacity, 'Director')
  assert.equal(structuredCompanyOtp.buyer_resolution_date, '2026-08-01')
  assert.equal(structuredCompanyOtp.buyer_authority_basis, 'Board resolution')
} finally {
  await server.close()
}

console.log('document merge-field registry audit passed')
