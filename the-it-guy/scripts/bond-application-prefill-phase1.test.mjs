import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BOND_APPLICATION_PREFILL_SOURCE_KEYS,
  BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
  BOND_APPLICATION_PREFILL_SOURCE_PRIORITY,
  getBondApplicationPrefillCoverageSummary,
  getBondApplicationPrefillField,
} from '../src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js'
import { buildLegacyBondApplicationDraft } from '../src/modules/bond/application/legacy/buildLegacyBondApplicationDraft.js'

const root = process.cwd()

function makePortal({ formData = {}, transaction = {}, buyer = {}, unit = {} } = {}) {
  return {
    buyer: {
      name: 'Fallback Buyer',
      email: 'fallback@example.com',
      phone: '0820000000',
      ...buyer,
    },
    onboardingFormData: {
      formData,
    },
    transaction: {
      finance_type: 'bond',
      purchase_price: 1_750_000,
      sales_price: 1_750_000,
      bond_amount: 1_400_000,
      deposit_amount: 350_000,
      purchaser_type: 'individual',
      property_address_line_1: '12 Agent Street',
      suburb: 'Agent Suburb',
      ...transaction,
    },
    unit: {
      unit_number: 'A-101',
      price: 1_800_000,
      development: {
        name: 'Matrix Gardens',
      },
      ...unit,
    },
  }
}

function assertField(path, expectedSources = []) {
  const field = getBondApplicationPrefillField(path)
  assert.ok(field, `${path} should be present in the prefill source matrix`)
  const sourceKeys = field.sources.map((source) => source.sourceKey)
  for (const expectedSource of expectedSources) {
    assert.ok(sourceKeys.includes(expectedSource), `${path} should include ${expectedSource}`)
  }
  return field
}

function runMatrixContractChecks() {
  const knownSources = new Set(BOND_APPLICATION_PREFILL_SOURCE_PRIORITY.map((source) => source.key))
  assert.deepEqual(
    BOND_APPLICATION_PREFILL_SOURCE_PRIORITY.map((source) => source.key).slice(0, 4),
    [
      BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication,
      BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
      BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
      BOND_APPLICATION_PREFILL_SOURCE_KEYS.structuredOtp,
    ],
    'source priority should preserve saved answers, then onboarding, agent setup, then structured OTP data',
  )

  const paths = new Set()
  for (const item of BOND_APPLICATION_PREFILL_SOURCE_MATRIX) {
    assert.ok(item.path, 'each matrix item needs a bond application path')
    assert.ok(item.label, `${item.path} needs a label`)
    assert.ok(item.section, `${item.path} needs a section`)
    assert.ok(Array.isArray(item.sources) && item.sources.length > 0, `${item.path} needs at least one source`)
    assert.equal(paths.has(item.path), false, `${item.path} should not be duplicated`)
    paths.add(item.path)
    for (const fieldSource of item.sources) {
      assert.ok(knownSources.has(fieldSource.sourceKey), `${item.path} uses unknown source ${fieldSource.sourceKey}`)
      assert.ok(Array.isArray(fieldSource.paths) && fieldSource.paths.length > 0, `${item.path} source ${fieldSource.sourceKey} needs paths`)
    }
  }

  const summary = getBondApplicationPrefillCoverageSummary()
  assert.ok(summary.totalFields >= 40, 'matrix should cover the high-value buyer bond application field set')
  assert.ok(summary.requiredFields >= 12, 'matrix should identify required originator-facing fields')
  assert.ok(summary.sections.includes('application_summary'), 'matrix should include application summary')
  assert.ok(summary.sections.includes('personal_details'), 'matrix should include personal details')
  assert.ok(summary.sections.includes('contact_address'), 'matrix should include contact/address')
  assert.ok(summary.sections.includes('loan_details'), 'matrix should include loan details')
  assert.ok(summary.sourceCounts.buyer_onboarding_form >= 20, 'buyer onboarding should be a primary automation source')
  assert.ok(summary.sourceCounts.agent_transaction_setup >= 7, 'agent transaction setup should be captured as a primary fallback')
  assert.ok(summary.sourceCounts.signed_otp_structured_transaction >= 6, 'structured OTP transaction data should be represented')

  assertField('summary.purchase_price', [
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.structuredOtp,
  ])
  assertField('summary.deposit_contribution', [
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.structuredOtp,
  ])
  assertField('loan_details.amount_to_be_registered', [
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.structuredOtp,
  ])
  assertField('contact_address.email_address', [
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerProfile,
  ])
  assertField('employment.primary.employer_name', [BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding])
}

function runLegacyDraftPrefillChecks() {
  const onboardingPortal = makePortal({
    buyer: {
      name: 'Buyer Profile Name',
      email: 'profile@example.com',
      phone: '0831111111',
    },
    formData: {
      first_name: 'Lerato',
      last_name: 'Mokoena',
      email: 'lerato@example.com',
      phone: '0832222222',
      identity_number: '9001015009087',
      marital_status: 'single',
      street_address: '44 Buyer Road',
      suburb: 'Buyer Suburb',
      city: 'Johannesburg',
      postal_code: '2196',
      employer_name: 'Buyer Employer',
      gross_monthly_income: '65000',
      purchase_price: '1900000',
      deposit_amount: '250000',
      bond_amount: '1650000',
      purchase_finance_type: 'bond',
      spouse_full_name: 'Co Applicant',
      spouse_identity_number: '9101015009088',
      spouse_email: 'co@example.com',
      spouse_phone: '0843333333',
    },
  })
  const draft = buildLegacyBondApplicationDraft(onboardingPortal)
  const primary = draft.applicants.find((applicant) => applicant.key === 'primary')
  const coApplicant = draft.applicants.find((applicant) => applicant.key === 'co_applicant')

  assert.equal(draft.summary.applicant_name, 'Lerato Mokoena')
  assert.equal(draft.summary.purchase_price, '1900000')
  assert.equal(draft.summary.deposit_contribution, '250000')
  assert.equal(draft.loan_details.amount_to_be_registered, '1650000')
  assert.equal(draft.contact_address.email_address, 'lerato@example.com')
  assert.equal(draft.contact_address.cellphone_number, '0832222222')
  assert.equal(draft.contact_address.residential_address_street, '44 Buyer Road')
  assert.equal(draft.contact_address.residential_address_city, 'Johannesburg')
  assert.equal(draft.employment.primary.employer_name, 'Buyer Employer')
  assert.equal(draft.income_deductions_expenses.primary.gross_salary, '65000')
  assert.equal(primary.first_name, 'Lerato')
  assert.equal(primary.last_name, 'Mokoena')
  assert.equal(primary.id_number, '9001015009087')
  assert.equal(primary.marital_status, 'single')
  assert.equal(coApplicant.first_name, 'Co')
  assert.equal(coApplicant.last_name, 'Applicant')
  assert.equal(coApplicant.id_number, '9101015009088')
  assert.equal(coApplicant.email, 'co@example.com')

  const transactionPortal = makePortal({
    formData: {},
    transaction: {
      purchase_price: 2_150_000,
      sales_price: 2_150_000,
      deposit_amount: 300_000,
      bond_amount: 1_850_000,
      finance_type: 'combination',
      property_address_line_1: '8 OTP Hydrated Avenue',
      suburb: 'Structured Suburb',
    },
    unit: {
      unit_number: 'B-202',
      development: { name: 'Structured Estate' },
    },
  })
  const transactionDraft = buildLegacyBondApplicationDraft(transactionPortal)
  assert.equal(transactionDraft.summary.purchase_price, '2150000')
  assert.equal(transactionDraft.summary.deposit_contribution, '300000')
  assert.equal(transactionDraft.summary.finance_type, 'combination')
  assert.match(transactionDraft.summary.property_reference, /Structured Estate/)
  assert.match(transactionDraft.summary.property_reference, /Unit B-202/)
  assert.equal(transactionDraft.loan_details.amount_to_be_registered, '1850000')
  assert.equal(transactionDraft.loan_details.street_or_complex, '8 OTP Hydrated Avenue')
  assert.equal(transactionDraft.loan_details.suburb, 'Structured Suburb')

  const savedPortal = makePortal({
    formData: {
      first_name: 'Current',
      last_name: 'Buyer',
      purchase_price: '1900000',
      bond_application: {
        summary: {
          applicant_name: 'Saved Buyer',
          purchase_price: '2000000',
        },
        applicants: [
          {
            key: 'primary',
            first_name: 'Saved',
            last_name: 'Applicant',
          },
        ],
        loan_details: {
          amount_to_be_registered: '1800000',
        },
      },
    },
    transaction: {
      purchase_price: 2_200_000,
      bond_amount: 1_900_000,
    },
  })
  const savedDraft = buildLegacyBondApplicationDraft(savedPortal)
  const savedPrimary = savedDraft.applicants.find((applicant) => applicant.key === 'primary')
  assert.equal(savedDraft.summary.applicant_name, 'Saved Buyer')
  assert.equal(savedDraft.summary.purchase_price, '2000000')
  assert.equal(savedDraft.loan_details.amount_to_be_registered, '1800000')
  assert.equal(savedPrimary.first_name, 'Saved')
  assert.equal(savedPrimary.last_name, 'Applicant')
}

async function runDocumentationChecks() {
  const [doc, matrixSource, draftBuilderSource] = await Promise.all([
    readFile(resolve(root, 'docs/bond-application/phase-1-prefill-source-audit.md'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/legacy/buildLegacyBondApplicationDraft.js'), 'utf8'),
  ])

  assert.match(doc, /Source Priority/)
  assert.match(doc, /Buyer onboarding form/)
  assert.match(doc, /Agent transaction setup/)
  assert.match(doc, /Signed OTP structured transaction data/)
  assert.match(doc, /does not parse values directly from the signed OTP PDF\/document/)
  assert.match(doc, /Saved buyer answers must always win/)
  assert.match(matrixSource, /BOND_APPLICATION_PREFILL_SOURCE_MATRIX/)
  assert.match(matrixSource, /signed_otp_structured_transaction/)
  assert.match(draftBuilderSource, /formData\.bond_application/)
  assert.match(draftBuilderSource, /formData\.purchase_price/)
  assert.match(draftBuilderSource, /portal\?\.transaction\?\.purchase_price/)
  assert.match(draftBuilderSource, /formData\.bond_amount/)
  assert.match(draftBuilderSource, /portal\.transaction\.bond_amount/)
}

runMatrixContractChecks()
runLegacyDraftPrefillChecks()
await runDocumentationChecks()

console.log('Bond application prefill Phase 1 checks passed.')
