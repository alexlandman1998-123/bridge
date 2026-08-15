import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  BOND_APPLICATION_PREFILL_VERSION,
  buildBondApplicationPrefillDraft,
  getBondApplicationPrefillSourceForPath,
} from '../src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'
import { BOND_APPLICATION_PREFILL_SOURCE_KEYS } from '../src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js'
import { buildBondApplicationState } from '../src/modules/bond/application/legacy/bondApplicationLegacyAdapter.js'

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

function getApplicant(application, key) {
  return application.applicants.find((applicant) => applicant.key === key)
}

function runSavedAnswerPriorityChecks() {
  const portal = makePortal({
    formData: {
      first_name: 'Current',
      last_name: 'Buyer',
      purchase_price: '1900000',
      bond_amount: '1600000',
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
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)
  const primary = getApplicant(application, 'primary')

  assert.equal(metadata.version, BOND_APPLICATION_PREFILL_VERSION)
  assert.equal(application.summary.applicant_name, 'Saved Buyer')
  assert.equal(application.summary.purchase_price, '2000000')
  assert.equal(application.loan_details.amount_to_be_registered, '1800000')
  assert.equal(primary.first_name, 'Saved')
  assert.equal(primary.last_name, 'Applicant')
  assert.equal(
    getBondApplicationPrefillSourceForPath(metadata, 'summary.purchase_price').sourceKey,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication,
  )
  assert.equal(
    getBondApplicationPrefillSourceForPath(metadata, 'loan_details.amount_to_be_registered').sourceKey,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication,
  )
}

function runBuyerOnboardingPrefillChecks() {
  const portal = makePortal({
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
    },
  })
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)
  const primary = getApplicant(application, 'primary')

  assert.equal(application.summary.applicant_name, 'Lerato Mokoena')
  assert.equal(application.summary.purchase_price, '1900000')
  assert.equal(application.summary.deposit_contribution, '250000')
  assert.equal(application.loan_details.amount_to_be_registered, '1650000')
  assert.equal(application.contact_address.email_address, 'lerato@example.com')
  assert.equal(application.contact_address.residential_address_street, '44 Buyer Road')
  assert.equal(application.employment.primary.employer_name, 'Buyer Employer')
  assert.equal(application.income_deductions_expenses.primary.gross_salary, '65000')
  assert.equal(primary.first_name, 'Lerato')
  assert.equal(primary.last_name, 'Mokoena')
  assert.equal(primary.id_number, '9001015009087')
  assert.equal(
    getBondApplicationPrefillSourceForPath(metadata, 'contact_address.email_address').sourceKey,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding,
  )
  assert.equal(metadata.sourceCounts.buyer_onboarding_form > 0, true)
}

function runTransactionEntityFallbackChecks() {
  const portal = makePortal({
    formData: {},
    transaction: {
      buyer_entity_type: 'company',
      buyer_entity_name: 'Agent Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
    },
  })
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)

  assert.equal(application.summary.buyer_entity_type, 'company')
  assert.equal(application.summary.purchaser_type, 'company')
  assert.equal(application.summary.buyer_entity_name, 'Agent Holdings (Pty) Ltd')
  assert.equal(application.summary.buyer_entity_registration_number, '2026/123456/07')
  assert.equal(
    getBondApplicationPrefillSourceForPath(metadata, 'summary.buyer_entity_name').sourceKey,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
  )
  assert.equal(
    getBondApplicationPrefillSourceForPath(metadata, 'summary.buyer_entity_registration_number').sourceKey,
    BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup,
  )
  assert.ok(metadata.appliedFields.includes('summary.buyer_entity_name'))
  assert.ok(metadata.appliedFields.includes('summary.buyer_entity_registration_number'))

  const state = buildBondApplicationState(portal)
  assert.equal(state.application.buyerEntity.entityType, 'company')
  assert.equal(state.application.buyerEntity.name, 'Agent Holdings (Pty) Ltd')
  assert.equal(state.application.buyerEntity.registrationNumber, '2026/123456/07')
}

async function runStaticChecks() {
  const [clientPortalSource, adapterSource, indexSource, builderSource, matrixSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/legacy/bondApplicationLegacyAdapter.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-3-prefill-automation-layer.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /buildBondApplicationPrefillDraft\(portal\)\.application/)
  assert.match(adapterSource, /buildBondApplicationPrefillDraft\(portal\)\.application/)
  assert.match(adapterSource, /'prefill_metadata'/)
  assert.match(indexSource, /buildBondApplicationPrefillDraft/)
  assert.match(indexSource, /getBondApplicationPrefillSourceForPath/)
  assert.match(builderSource, /prefill_metadata/)
  assert.match(builderSource, /sourceByPath/)
  assert.match(builderSource, /appliedFields/)
  assert.match(builderSource, /preservedFields/)
  assert.match(builderSource, /missingFields/)
  assert.match(matrixSource, /portal\.transaction\.buyer_entity_name/)
  assert.match(matrixSource, /portal\.transaction\.buyer_entity_registration_number/)
  assert.match(docSource, /Source Metadata/)
  assert.match(docSource, /saved bond application answers remain/)
  assert.match(docSource, /Phase 1 Gap Closed/)
}

runSavedAnswerPriorityChecks()
runBuyerOnboardingPrefillChecks()
runTransactionEntityFallbackChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 3 checks passed.')
