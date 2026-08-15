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

runFirstMissingFieldChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 6 checks passed.')
