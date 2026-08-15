import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  buildBondApplicationPrefillConfirmationCards,
  buildBondApplicationPrefillConfirmationMetadata,
  buildBondApplicationPrefillDraft,
} from '../src/modules/bond/application/index.js'
import {
  buildBondApplicationPdfHtml,
  buildBondApplicationViewModel,
} from '../src/modules/bond/utils/bondApplicationViewModel.js'

const root = process.cwd()

function makePortal() {
  return {
    buyer: {
      name: 'Lerato Mokoena',
      email: 'lerato@example.com',
      phone: '0832222222',
    },
    onboardingFormData: {
      formData: {
        first_name: 'Lerato',
        last_name: 'Mokoena',
        email: 'lerato@example.com',
        phone: '0832222222',
        identity_number: '9001015009087',
        street_address: '44 Buyer Road',
        suburb: 'Buyer Suburb',
        city: 'Johannesburg',
        postal_code: '2196',
        purchase_price: '1900000',
        deposit_amount: '250000',
        bond_amount: '1650000',
      },
    },
    transaction: {
      finance_type: 'bond',
      purchase_price: 1_900_000,
      sales_price: 1_900_000,
      bond_amount: 1_650_000,
      deposit_amount: 250_000,
      purchaser_type: 'company',
      buyer_entity_type: 'company',
      buyer_entity_name: 'Mokoena Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
      property_address_line_1: '44 Buyer Road',
      suburb: 'Buyer Suburb',
    },
    unit: {
      unit_number: 'A-101',
      price: 1_900_000,
      development: {
        name: 'Matrix Gardens',
      },
    },
  }
}

function buildConfirmedApplication() {
  const portal = makePortal()
  const { application, metadata } = buildBondApplicationPrefillDraft(portal)
  const cards = buildBondApplicationPrefillConfirmationCards(application, metadata)
  const prefillMetadata = buildBondApplicationPrefillConfirmationMetadata(metadata, cards, {
    confirmedSectionKeys: ['summary', 'contact_address'],
    now: '2026-08-15T08:00:00.000Z',
  })

  return {
    portal,
    application: {
      ...application,
      prefill_metadata: prefillMetadata,
    },
  }
}

function runOriginatorWorkspaceChecks() {
  const { portal, application } = buildConfirmedApplication()
  const viewModel = buildBondApplicationViewModel({
    transaction: portal.transaction,
    buyer: portal.buyer,
    unit: portal.unit,
    development: portal.unit.development,
    onboardingFormData: {
      formData: {
        ...portal.onboardingFormData.formData,
        bond_application: application,
      },
    },
    bondApplication: application,
    statusLabel: application.status,
  })
  const workspace = viewModel.originatorReviewWorkspace

  assert.equal(workspace.version, 'phase-15-v1')
  assert.equal(workspace.source, 'buyer_portal_originator_review_workspace')
  assert.equal(workspace.target, 'bond_originator_workspace')
  assert.equal(workspace.score > 0, true)
  assert.equal(workspace.sourceBuckets.some((bucket) => bucket.key === 'buyer_confirmed'), true)
  assert.equal(workspace.sourceBuckets.some((bucket) => bucket.key === 'system_prefilled'), true)
  assert.equal(workspace.sourceBuckets.some((bucket) => bucket.key === 'missing_data'), true)
  assert.equal(workspace.buyerConfirmedSections.length, 2)
  assert.equal(workspace.unconfirmedBuyerSections.length, 2)
  assert.equal(workspace.systemPrefilledSections.length > 0, true)
  assert.equal(workspace.missingOriginatorFields.length > 0, true)
  assert.equal(workspace.missingOriginatorActions.length > 0, true)
  assert.match(workspace.recommendedAction, /missing originator fields|unconfirmed buyer sections|outstanding documents|ready for originator review/i)

  const html = buildBondApplicationPdfHtml(viewModel, '2026-08-15T10:00:00.000Z')
  assert.match(html, /Originator Review Workspace/)
  assert.match(html, /Originator Action List/)
  assert.match(html, /Buyer-confirmed/)
  assert.match(html, /System-prefilled/)
  assert.match(html, /Missing data/)
}

async function runStaticChecks() {
  const [viewModelSource, attorneyDetailSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/modules/bond/utils/bondApplicationViewModel.js'), 'utf8'),
    readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-15-originator-review-workspace-ux.md'), 'utf8'),
  ])

  assert.match(viewModelSource, /buildOriginatorReviewWorkspace/)
  assert.match(viewModelSource, /originatorReviewWorkspace/)
  assert.match(viewModelSource, /buyer_portal_originator_review_workspace/)
  assert.match(viewModelSource, /Originator Review Workspace/)
  assert.match(attorneyDetailSource, /data-bond-originator-review-workspace="phase-15"/)
  assert.match(attorneyDetailSource, /data-bond-originator-action-list="true"/)
  assert.match(attorneyDetailSource, /bondApplicationOriginatorWorkspace/)
  assert.match(docSource, /Originator Review Workspace UX/)
  assert.match(docSource, /buyer-confirmed, system-prefilled, and missing data/)
  assert.match(docSource, /does not mutate buyer data/)
}

runOriginatorWorkspaceChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 15 checks passed.')
