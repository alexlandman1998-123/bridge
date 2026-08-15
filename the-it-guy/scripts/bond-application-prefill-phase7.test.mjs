import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildLegacyBondApplicationPersistencePayload } from '../src/modules/bond/application/bondApplicationPersistence.js'
import { buildBondApplicationPrefillDraft } from '../src/modules/bond/application/prefill/bondApplicationPrefillBuilder.js'
import {
  BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION,
  buildBondApplicationPrefillConfirmationCards,
  buildBondApplicationPrefillConfirmationMetadata,
  buildBondApplicationPrefillReviewModel,
  clearBondApplicationPrefillSectionConfirmation,
  getBondApplicationPrefillConfirmedSectionKeys,
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
      buyer_entity_type: 'company',
      buyer_entity_name: 'Agent Holdings (Pty) Ltd',
      buyer_entity_registration_number: '2026/123456/07',
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

function runConfirmationMetadataChecks() {
  const { application, metadata } = buildBondApplicationPrefillDraft(makePortal({
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
      purchase_price: '1900000',
      deposit_amount: '250000',
      bond_amount: '1650000',
    },
  }))
  const cards = buildBondApplicationPrefillConfirmationCards(application, metadata)
  const confirmationMetadata = buildBondApplicationPrefillConfirmationMetadata(metadata, cards, {
    confirmedSectionKeys: ['summary', 'contact_address'],
    now: '2026-08-15T08:00:00.000Z',
  })

  assert.equal(confirmationMetadata.confirmations.version, BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION)
  assert.deepEqual(confirmationMetadata.confirmations.confirmedSectionKeys, ['contact_address', 'summary'])
  assert.equal(confirmationMetadata.confirmations.sections.summary.confirmed, true)
  assert.equal(confirmationMetadata.confirmations.sections.summary.confidence, 'buyer_confirmed_prefill')
  assert.equal(confirmationMetadata.confirmations.sections.summary.confirmedAt, '2026-08-15T08:00:00.000Z')
  assert.ok(confirmationMetadata.confirmations.sections.summary.fieldPaths.includes('summary.applicant_name'))
  assert.equal(getBondApplicationPrefillConfirmedSectionKeys(confirmationMetadata).includes('summary'), true)

  const review = buildBondApplicationPrefillReviewModel(confirmationMetadata, { activeSection: 'summary' })
  assert.equal(review.confirmedSectionCount, 2)
  assert.deepEqual(review.confirmedSectionKeys, ['summary', 'contact_address'])
  assert.equal(review.confirmationConfidenceBySection.summary, 'buyer_confirmed_prefill')

  const cleared = clearBondApplicationPrefillSectionConfirmation(confirmationMetadata, 'summary', {
    now: '2026-08-15T08:05:00.000Z',
  })
  assert.equal(cleared.confirmations.sections.summary, undefined)
  assert.deepEqual(cleared.confirmations.confirmedSectionKeys, ['contact_address'])
  assert.equal(cleared.confirmations.updatedAt, '2026-08-15T08:05:00.000Z')

  const { draftToPersist, formData } = buildLegacyBondApplicationPersistencePayload({
    existingFormData: { existing_value: 'keep-me' },
    legacyBondApplication: {
      ...application,
      prefill_metadata: confirmationMetadata,
    },
    timestamp: '2026-08-15T08:10:00.000Z',
  })
  assert.equal(draftToPersist.prefill_metadata.confirmations.version, BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION)
  assert.equal(formData.existing_value, 'keep-me')
  assert.equal(formData.bond_application.prefill_metadata.confirmations.sections.summary.confidence, 'buyer_confirmed_prefill')
}

async function runStaticChecks() {
  const [clientPortalSource, indexSource, reviewModelSource, docSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/index.js'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationPrefillReviewModel.js'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-7-confirmation-metadata-confidence.md'), 'utf8'),
  ])

  assert.match(clientPortalSource, /buildBondApplicationPrefillConfirmationMetadata/)
  assert.match(clientPortalSource, /clearBondApplicationPrefillSectionConfirmation/)
  assert.match(clientPortalSource, /getBondApplicationPrefillConfirmedSectionKeys/)
  assert.match(clientPortalSource, /withBondApplicationConfirmationMetadata/)
  assert.match(clientPortalSource, /prefill_metadata/)
  assert.match(indexSource, /BOND_APPLICATION_PREFILL_CONFIRMATION_VERSION/)
  assert.match(indexSource, /buildBondApplicationPrefillConfirmationMetadata/)
  assert.match(indexSource, /clearBondApplicationPrefillSectionConfirmation/)
  assert.match(reviewModelSource, /confirmedSectionKeys/)
  assert.match(reviewModelSource, /confirmationConfidenceBySection/)
  assert.match(docSource, /Confirmation Metadata/)
  assert.match(docSource, /originator-facing surfaces/)
}

runConfirmationMetadataChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 7 checks passed.')
