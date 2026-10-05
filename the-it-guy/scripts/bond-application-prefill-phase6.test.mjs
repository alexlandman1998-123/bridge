import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildBondApplicationPrefillDraft } from '../src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'
import { buildBondApplicationPrefillConfirmationCards } from '../src/modules/bond/application/prefill/bondApplicationPrefillReviewModel.js'

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

function runFirstMissingFieldChecks() {
  const { metadata } = buildBondApplicationPrefillDraft(makePortal())
  const [summaryCard] = buildBondApplicationPrefillConfirmationCards({
    summary: {
      applicant_name: 'Saved Buyer',
      finance_type: 'bond',
    },
    applicants: [{ key: 'primary' }],
    contact_address: {},
    loan_details: {},
  }, metadata, { activeSection: 'summary' })

  assert.equal(summaryCard.complete, false)
  assert.equal(summaryCard.firstMissingFieldPath, 'summary.purchase_price')
  assert.equal(summaryCard.firstMissingFieldLabel, 'Purchase price')
  assert.ok(summaryCard.missingFieldLabels.includes('Purchase price'))

  const { application, metadata: completeMetadata } = buildBondApplicationPrefillDraft(makePortal({
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
    },
  }))
  const [completeSummaryCard] = buildBondApplicationPrefillConfirmationCards(application, completeMetadata, { activeSection: 'summary' })
  assert.equal(completeSummaryCard.complete, true)
  assert.equal(completeSummaryCard.firstMissingFieldPath, '')
  assert.equal(completeSummaryCard.firstMissingFieldLabel, '')
}

async function runStaticChecks() {
  const [clientPortalSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-6-section-confirmation-actions.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /bondApplicationConfirmedSectionKeys/)
  assert.match(clientPortalSource, /bondApplicationExpandedSectionKeys/)
  assert.match(clientPortalSource, /confirmActiveBondApplicationSection/)
  assert.match(clientPortalSource, /scrollToBondApplicationField/)
  assert.match(clientPortalSource, /data-bond-prefill-section-actions="true"/)
  assert.match(clientPortalSource, /Confirm Section/)
  assert.match(clientPortalSource, /Complete Missing Field/)
  assert.match(clientPortalSource, /Edit Detailed Fields/)
  assert.match(clientPortalSource, /shouldCollapseBondApplicationDetails/)
  assert.match(clientPortalSource, /setBondApplicationConfirmedSectionKeys\(\(previous\) => previous\.filter/)
  assert.match(docSource, /Section Confirmation Actions/)
  assert.match(docSource, /firstMissingFieldPath/)
  assert.match(docSource, /Editing any field/)
}

function runConditionalReviewChecks() {
  const application = {
    summary: { applicant_name: 'Buyer', finance_type: 'bond', purchase_price: 1000000, buyer_entity_type: 'individual' },
    applicants: [{ key: 'primary', first_name: 'Buyer', last_name: 'Example', id_number: '9001010000000', marital_status: 'single', nationality: 'South African' }],
    loan_details: { street_or_complex: '12 Street', suburb: 'Town', amount_to_be_registered: 1000000 },
  }
  const card = (key) => buildBondApplicationPrefillConfirmationCards(application).find((item) => item.key === key)
  assert.equal(card('application_summary').complete, true, 'Individual does not require entity details or a deposit')
  assert.equal(card('primary_applicant').complete, true, 'ID does not also require a passport')
  application.applicants[0].passport_number = 'P123456'
  delete application.applicants[0].id_number
  assert.equal(card('primary_applicant').complete, true, 'Passport satisfies identity review')
  delete application.applicants[0].passport_number
  assert.equal(card('primary_applicant').missingFields, 1, 'Missing identity produces a single action')
  application.summary.property_reference = '12 Street'
  assert.equal(card('finance_property').complete, true, 'Existing property does not require development or unit')
  for (const type of ['company', 'trust']) {
    application.summary.buyer_entity_type = type
    assert.equal(card('application_summary').missingFields, 2, `${type} still requires entity name and registration`)
  }
  application.summary.buyer_entity_name = 'Saved entity'
  application.summary.buyer_entity_type = 'individual'
  card('application_summary')
  assert.equal(application.summary.buyer_entity_name, 'Saved entity', 'Review never deletes saved answers')
}

runConditionalReviewChecks()
runFirstMissingFieldChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 6 checks passed.')
