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
        passport_number: 'A1234567',
        marital_status: 'single',
        nationality: 'South African',
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
      property_address_line_1: '44 Buyer Road',
      suburb: 'Buyer Suburb',
      buyer_entity_type: 'company',
      buyer_entity_name: 'Mokoena Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
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

function buildConfirmedLegacyApplication() {
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

function runViewModelChecks() {
  const { portal, application } = buildConfirmedLegacyApplication()
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

  assert.equal(viewModel.buyerConfirmationConfidence.source, 'buyer_portal_prefill_confirmation_metadata')
  assert.equal(viewModel.buyerConfirmationConfidence.target, 'bond_originator_view_model')
  assert.equal(viewModel.buyerConfirmationConfidence.confirmedCount, 2)
  assert.equal(viewModel.buyerConfirmationConfidence.totalSupportedSections, 4)
  assert.equal(viewModel.buyerConfirmationConfidence.percent, 50)
  assert.equal(viewModel.buyerConfirmationConfidence.confidenceLevel, 'partial')
  assert.equal(viewModel.buyerConfirmationConfidence.fieldAlignmentPercent > 0, true)
  assert.deepEqual(viewModel.buyerConfirmationConfidence.confirmedSectionKeys, ['contact_address', 'summary'])
  assert.deepEqual(viewModel.buyerConfirmationConfidence.missingSectionKeys, ['personal_details', 'loan_details'])
  assert.equal(viewModel.buyerConfirmationConfidence.lastConfirmedAt, '2026-08-15T08:00:00.000Z')
  assert.equal(viewModel.confirmationConfidence, viewModel.buyerConfirmationConfidence)
  assert.equal(viewModel.buyerConfirmationConfidence.sections.some((section) => section.confidence === 'buyer_confirmed_prefill'), true)

  const html = buildBondApplicationPdfHtml(viewModel, '2026-08-15T10:00:00.000Z')
  assert.match(html, /Buyer Section Confirmations/)
  assert.match(html, /Unconfirmed Buyer Sections/)
  assert.match(html, /2\/4 buyer sections confirmed \(50%\)/)
  assert.match(html, /Contact Address/)
  assert.match(html, /Personal Details/)
}

async function runStaticChecks() {
  const [viewModelSource, attorneyDetailSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/modules/bond/utils/bondApplicationViewModel.js'), 'utf8'),
    readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-8-confirmation-confidence-originator.md'), 'utf8'),
  ])

  assert.match(viewModelSource, /buyerConfirmationConfidence/)
  assert.match(viewModelSource, /buyer_portal_prefill_confirmation_metadata/)
  assert.match(viewModelSource, /confirmedSectionKeys/)
  assert.match(attorneyDetailSource, /Buyer Section Confirmations/)
  assert.match(attorneyDetailSource, /bondApplicationConfirmationConfidence/)
  assert.match(viewModelSource, /Buyer Section Confirmations/)
  assert.match(docSource, /originator workspace/)
  assert.match(docSource, /read-only against application data/)
}

runViewModelChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 8 checks passed.')
