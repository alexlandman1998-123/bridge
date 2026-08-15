import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildBondApplicationPrefillDraft } from '../src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'
import {
  BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS,
  buildBondApplicationPrefillConfirmationCards,
} from '../src/modules/bond/application/prefill/bondApplicationPrefillReviewModel.js'

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

function runConfirmationCardModelChecks() {
  const portal = makePortal({
    formData: {
      first_name: 'Lerato',
      last_name: 'Mokoena',
      email: 'lerato@example.com',
      phone: '0832222222',
      identity_number: '9001015009087',
      marital_status: 'single',
      street_address: '44 Buyer Road',
      city: 'Johannesburg',
      postal_code: '2196',
      purchase_price: '1900000',
      deposit_amount: '250000',
      bond_amount: '1650000',
    },
    transaction: {
      buyer_entity_type: 'company',
      buyer_entity_name: 'Agent Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
      property_address_line_1: '8 OTP Hydrated Avenue',
      suburb: 'Structured Suburb',
    },
    unit: {
      unit_number: 'B-202',
      development: { name: 'Structured Estate' },
    },
  })
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)

  assert.equal(BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS.length >= 4, true)

  const summaryCards = buildBondApplicationPrefillConfirmationCards(application, metadata, { activeSection: 'summary' })
  assert.equal(summaryCards.length, 1)
  assert.equal(summaryCards[0].key, 'application_summary')
  assert.ok(summaryCards[0].confirmedFields >= 5)
  assert.ok(summaryCards[0].fields.find((field) => field.path === 'summary.applicant_name')?.hasValue)
  assert.equal(summaryCards[0].fields.find((field) => field.path === 'summary.buyer_entity_name')?.valueLabel, 'Agent Holdings (Pty) Ltd')

  const applicantCards = buildBondApplicationPrefillConfirmationCards(application, metadata, { activeSection: 'personal_details' })
  assert.equal(applicantCards.length, 1)
  assert.equal(applicantCards[0].key, 'primary_applicant')
  assert.equal(applicantCards[0].fields.find((field) => field.path === 'applicants.primary.first_name')?.valueLabel, 'Lerato')
  assert.equal(applicantCards[0].fields.find((field) => field.path === 'applicants.primary.id_number')?.review.label, 'Already filled')

  const contactCards = buildBondApplicationPrefillConfirmationCards(application, metadata, { activeSection: 'contact_address' })
  assert.equal(contactCards.length, 1)
  assert.equal(contactCards[0].key, 'contact_address')
  assert.equal(contactCards[0].fields.find((field) => field.path === 'contact_address.email_address')?.valueLabel, 'lerato@example.com')

  const loanCards = buildBondApplicationPrefillConfirmationCards(application, metadata, { activeSection: 'loan_details' })
  assert.equal(loanCards.length, 1)
  assert.equal(loanCards[0].key, 'finance_property')
  assert.equal(loanCards[0].fields.find((field) => field.path === 'loan_details.amount_to_be_registered')?.valueLabel, '1650000')

  const incompleteCards = buildBondApplicationPrefillConfirmationCards({
    summary: {},
    applicants: [{ key: 'primary' }],
    contact_address: {},
    loan_details: {},
  }, metadata, { activeSection: 'summary' })
  assert.equal(incompleteCards[0].complete, false)
  assert.ok(incompleteCards[0].missingFieldLabels.includes('Applicant'))
}

async function runStaticChecks() {
  const [clientPortalSource, indexSource, reviewModelSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillReviewModel.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-5-confirmation-first-cards.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /buildBondApplicationPrefillConfirmationCards/)
  assert.match(clientPortalSource, /data-bond-prefill-confirmation-cards="true"/)
  assert.match(clientPortalSource, /Review and confirm/)
  assert.match(clientPortalSource, /Still needed/)
  assert.match(indexSource, /buildBondApplicationPrefillConfirmationCards/)
  assert.match(indexSource, /BOND_APPLICATION_PREFILL_CONFIRMATION_CARD_DEFINITIONS/)
  assert.match(reviewModelSource, /Application summary/)
  assert.match(reviewModelSource, /Primary applicant/)
  assert.match(reviewModelSource, /Finance and property/)
  assert.match(docSource, /Confirmation-First Cards/)
  assert.match(docSource, /jump to first missing field/)
}

runConfirmationCardModelChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 5 checks passed.')
