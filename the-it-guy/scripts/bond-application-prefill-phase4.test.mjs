import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildBondApplicationPrefillDraft } from '../src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'
import {
  buildBondApplicationPrefillReviewModel,
  getBondApplicationPrefillFieldReview,
  normalizeBondApplicationPrefillSectionKey,
} from '../src/modules/bond/application/prefill/bondApplicationPrefillReviewModel.js'
import { BOND_APPLICATION_PREFILL_SOURCE_KEYS } from '../src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js'

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

function runReviewModelChecks() {
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
      employer_name: 'Buyer Employer',
      gross_monthly_income: '65000',
      purchase_price: '1900000',
      deposit_amount: '250000',
      bond_amount: '1650000',
      bond_application: {
        summary: {
          applicant_name: 'Saved Buyer',
        },
      },
    },
    transaction: {
      buyer_entity_type: 'company',
      buyer_entity_name: 'Agent Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
    },
  })
  const { metadata } = buildBondApplicationPrefillDraft(portal)
  const review = buildBondApplicationPrefillReviewModel(metadata, { activeSection: 'summary' })

  assert.equal(review.hasMetadata, true)
  assert.equal(review.activeSection, 'summary')
  assert.ok(review.totalAuditedFields >= 40)
  assert.ok(review.sourcedFieldCount > 10)
  assert.ok(review.coveragePercent > 0)
  assert.ok(review.activeSectionSummary)
  assert.equal(review.activeSectionSummary.key, 'summary')
  assert.ok(review.activeSectionSummary.totalFields > 0)
  assert.ok(review.sourceCounts.some((source) => source.key === BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication))
  assert.ok(review.sourceCounts.some((source) => source.key === BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding))
  assert.ok(review.sourceCounts.some((source) => source.key === BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup))

  const savedBadge = getBondApplicationPrefillFieldReview(metadata, 'summary.applicant_name')
  assert.equal(savedBadge.status, 'saved')
  assert.equal(savedBadge.label, 'Saved answer')
  assert.equal(savedBadge.detail, 'Already in this application')

  const onboardingBadge = getBondApplicationPrefillFieldReview(metadata, 'contact_address.email_address')
  assert.equal(onboardingBadge.status, 'confirmed')
  assert.equal(onboardingBadge.label, 'Already filled')
  assert.equal(onboardingBadge.sourceKey, BOND_APPLICATION_PREFILL_SOURCE_KEYS.buyerOnboarding)

  const agentBadge = getBondApplicationPrefillFieldReview(metadata, 'summary.buyer_entity_name')
  assert.equal(agentBadge.sourceKey, BOND_APPLICATION_PREFILL_SOURCE_KEYS.agentTransactionSetup)
  assert.equal(agentBadge.label, 'Already filled')

  const missingBadge = getBondApplicationPrefillFieldReview({
    missingFields: [{ path: 'loan_details.debit_order_bank_name', label: 'Debit order bank name', section: 'loan_details' }],
  }, 'loan_details.debit_order_bank_name')
  assert.equal(missingBadge.status, 'missing')
  assert.equal(missingBadge.label, 'Needs input')
  assert.equal(missingBadge.detail, 'Required for submission')

  const completedMissingBadge = getBondApplicationPrefillFieldReview({
    missingFields: [{ path: 'loan_details.debit_order_bank_name', label: 'Debit order bank name', section: 'loan_details' }],
  }, 'loan_details.debit_order_bank_name', { currentValue: 'FNB' })
  assert.equal(completedMissingBadge, null)

  assert.equal(normalizeBondApplicationPrefillSectionKey('application_summary'), 'summary')
  assert.equal(normalizeBondApplicationPrefillSectionKey('contact_address'), 'contact_address')
}

async function runStaticChecks() {
  const [clientPortalSource, indexSource, reviewModelSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillReviewModel.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-4-prefill-review-ui.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /buildBondApplicationPrefillReviewModel/)
  assert.match(clientPortalSource, /getBondApplicationPrefillFieldReview/)
  assert.match(clientPortalSource, /data-bond-prefill-review-panel="true"/)
  assert.match(clientPortalSource, /Already filled/)
  assert.match(clientPortalSource, /renderBondPrefillBadge/)
  assert.match(
    clientPortalSource,
    /className=\{isBondApplication \? 'hidden' : 'lg:hidden'\}/,
    'The simplified buyer mobile portal should not swallow the bond application deep link.',
  )
  assert.match(
    clientPortalSource,
    /isBondApplication && effectiveWorkspace !== 'seller' \? 'flex min-h-screen' : 'hidden min-h-screen lg:flex'/,
    'The full bond application workspace should render on mobile for /client/:token/bond-application.',
  )
  assert.match(indexSource, /buildBondApplicationPrefillReviewModel/)
  assert.match(indexSource, /getBondApplicationPrefillFieldReview/)
  assert.match(reviewModelSource, /Saved answer/)
  assert.match(reviewModelSource, /Needs input/)
  assert.match(docSource, /Buyer Bond Application Prefill Review UI/)
  assert.match(docSource, /confirmation-first cards/)
}

runReviewModelChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 4 checks passed.')
