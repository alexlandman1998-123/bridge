import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  OTP_CANONICAL_RUNTIME_BINDING_VERSION,
  OTP_CANONICAL_TEMPLATE_TOKENS,
  buildCanonicalOtpRuntimeBinding,
  canonicalOtpAmountInWords,
  formatCanonicalOtpDate,
  formatCanonicalOtpMoney,
} from '../../../../../supabase/functions/_shared/otpCanonicalRuntimeBinding.mjs'

function completeIndividualFixture(overrides = {}) {
  return {
    transaction: {
      purchase_price: 2500000,
      deposit_amount: 100000,
      bond_amount: 2000000,
      cash_amount: 400000,
      ...overrides.transaction,
    },
    buyer: { name: 'Alex Buyer', email: 'alex@example.com', phone: '0825550101' },
    unit: {
      address_line1: '14 Example Avenue',
      suburb: 'Northmead',
      city: 'Benoni',
      province: 'Gauteng',
    },
    onboardingFormData: {
      purchaser_entity_type: 'individual',
      purchasers: [{
        first_name: 'Alex',
        last_name: 'Buyer',
        identity_number: '9001015009087',
        tax_number: '0123456789',
        street_address: '10 Sample Street',
        suburb: 'Benoni',
        city: 'Benoni',
        postal_code: '1501',
        marital_status: 'married',
        marital_regime: 'in_community',
        email: 'alex@example.com',
        phone: '0825550101',
        employment_type: 'full_time',
        employer_name: 'Example Employer',
        job_title: 'Director',
        gross_monthly_income: 85000,
      }],
      finance: { purchase_price: 2500000, bond_amount: 2000000, cash_amount: 400000, bond_bank_name: 'Example Bank' },
      ...overrides.onboardingFormData,
    },
    sourceContext: {
      property: { erf_number: 'Erf 1234', township: 'Northmead Township' },
      agent: { name: 'Alyssa Agent', ffc_number: 'AGENT-FFC', phone: '0825550301', email: 'agent@example.co.za' },
      organisation: {
        legal_name: 'Kingstons Real Estate',
        ffc_number: 'AGENCY-FFC',
        physical_address: '14th Avenue, Northmead',
        phone: '0100202431',
        email: 'offers@example.co.za',
        principal_agent: { name: 'Principal Agent', ffc_number: 'PRINCIPAL-FFC' },
      },
      seller: { owners: [{ full_name: 'Taylor Seller', id_number: '8001015009089', residential_address: '14 Example Avenue' }] },
      ...overrides.sourceContext,
    },
    placeholderOverrides: overrides.placeholderOverrides || {},
    specialConditions: overrides.specialConditions || '',
  }
}

test('binds every placeholder declared by the canonical DOCX manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../../../templates/legal/kingstons-2026-otp-canonical-v1.manifest.json', import.meta.url)))
  const manifestTokens = manifest.fields.flatMap((field) => field.slots.map((slot) => slot.token)).sort()

  assert.equal(OTP_CANONICAL_RUNTIME_BINDING_VERSION, 'kingstons_2026_otp_runtime_v1')
  assert.deepEqual([...OTP_CANONICAL_TEMPLATE_TOKENS].sort(), manifestTokens)
  assert.equal(new Set(OTP_CANONICAL_TEMPLATE_TOKENS).size, 118)
})

test('populates the existing OTP from buyer onboarding and transaction facts', () => {
  const binding = buildCanonicalOtpRuntimeBinding(completeIndividualFixture())

  assert.equal(binding.ready, true)
  assert.deepEqual(binding.blockers, [])
  assert.equal(binding.placeholders.purchaser_1_full_name, 'Alex Buyer')
  assert.equal(binding.placeholders.cover_property_address, '14 Example Avenue, Northmead, Benoni')
  assert.equal(binding.placeholders.marital_community_mark, 'X')
  assert.equal(binding.placeholders.marital_unmarried_mark, '')
  assert.equal(binding.placeholders.property_physical_address, '14 Example Avenue, Northmead, Benoni, Gauteng')
  assert.equal(binding.placeholders.offer_purchase_price, '2 500 000,00')
  assert.equal(binding.placeholders.offer_purchase_price_words, 'Two million five hundred thousand rand')
  assert.equal(binding.placeholders.bond_applicant_1_full_time_mark, 'X')
  assert.equal(binding.placeholders.bond_regular_salary_mark, 'X')
  assert.equal(binding.placeholders.bond_applicant_2_spouse_income, '')
  assert.equal(binding.placeholders.bond_applicant_2_bank, '')
  assert.ok(OTP_CANONICAL_TEMPLATE_TOKENS.every((token) => Object.hasOwn(binding.placeholders, token)))
})

test('treats a company as purchaser data and never as a different template', () => {
  const fixture = completeIndividualFixture({
    onboardingFormData: {
      purchaser_entity_type: 'company',
      company: {
        company_name: 'Example Holdings (Pty) Ltd',
        company_registration_number: '2020/123456/07',
        company_registered_address: '1 Company Road, Sandton',
        company_tax_number: '9999999999',
        vat_number: '4123456789',
      },
      finance: { purchase_price: 2500000 },
    },
  })
  const binding = buildCanonicalOtpRuntimeBinding(fixture)

  assert.equal(binding.ready, true)
  assert.equal(binding.placeholders.purchaser_1_full_name, 'Example Holdings (Pty) Ltd')
  assert.equal(binding.placeholders.purchaser_1_identity_number, '2020/123456/07')
  assert.equal(binding.placeholders.purchaser_1_income_tax_number, '9999999999')
  assert.equal(binding.placeholders.marital_unmarried_mark, '')
  assert.equal(binding.placeholders.marital_community_mark, '')
})

test('blocks unapproved free-text legal conditions in canonical mode', () => {
  const unapproved = buildCanonicalOtpRuntimeBinding(completeIndividualFixture({
    specialConditions: 'Seller will repair the pool pump.',
  }))
  const approved = buildCanonicalOtpRuntimeBinding(completeIndividualFixture({
    sourceContext: {
      property: { erf_number: 'Erf 1234', township: 'Northmead Township' },
      agent: { name: 'Alyssa Agent', ffc_number: 'AGENT-FFC' },
      organisation: {
        legal_name: 'Kingstons Real Estate', ffc_number: 'AGENCY-FFC', physical_address: '14th Avenue',
        phone: '0100202431', email: 'offers@example.co.za', principal_agent: { name: 'Principal Agent', ffc_number: 'PRINCIPAL-FFC' },
      },
      seller: { owners: [{ full_name: 'Taylor Seller', id_number: '8001015009089', residential_address: '14 Example Avenue' }] },
      transaction: { approved_special_conditions: [{ status: 'approved', wording: 'Approved pool-pump clause.' }] },
    },
  }))

  assert.equal(unapproved.ready, false)
  assert.deepEqual(unapproved.attorneyReviewRequiredTokens, ['special_conditions'])
  assert.equal(unapproved.placeholders.special_conditions, '')
  assert.equal(approved.ready, true)
  assert.equal(approved.placeholders.special_conditions, 'Approved pool-pump clause.')
})

test('reports required missing values before rendering', () => {
  const binding = buildCanonicalOtpRuntimeBinding({ transaction: { purchase_price: 1000000 } })

  assert.equal(binding.ready, false)
  assert.ok(binding.missingRequiredTokens.includes('purchaser_1_full_name'))
  assert.ok(binding.missingRequiredTokens.includes('seller_1_full_name'))
  assert.ok(binding.blockers.every((item) => item.code === 'required_value_missing'))
})

test('uses deterministic South African document formatting', () => {
  assert.equal(formatCanonicalOtpMoney(2500000), '2 500 000,00')
  assert.equal(formatCanonicalOtpMoney('12500', { symbol: true }), 'R 12 500,00')
  assert.equal(formatCanonicalOtpDate('2026-07-15'), '15 July 2026')
  assert.equal(canonicalOtpAmountInWords(2500000), 'Two million five hundred thousand rand')
})
