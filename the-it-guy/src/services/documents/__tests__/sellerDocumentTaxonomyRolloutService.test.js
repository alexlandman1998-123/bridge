import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSellerDocumentTaxonomyComparison,
  projectSellerDocumentRowsForTaxonomyRollout,
  resolveSellerDocumentTaxonomyProjectionRollout,
} from '../sellerDocumentTaxonomyRolloutService.js'
import { buildSellerSigningStatusModel } from '../../sellerSigningStatusService.js'
import { createSellerOnboardingSigningLifecycle, SELLER_ONBOARDING_SIGNING_STAGES } from '../../../core/documents/sellerOnboardingSigningLifecycle.js'

const rows = [
  { key: 'levy_statement', listingId: 'listing-1', partyId: 'seller-1', category: 'legal' },
  { key: 'sectional_levy_statement', listingId: 'listing-1', partyId: 'seller-1', category: 'property' },
  { key: 'solar_compliance_documents', listingId: 'listing-1', partyId: 'seller-1', category: 'legal' },
  { key: 'body_corporate_details', listingId: 'listing-1', partyId: 'seller-1', category: 'legal' },
]

test('fails closed outside a one-listing canary and enables only its listing', () => {
  assert.equal(resolveSellerDocumentTaxonomyProjectionRollout({ rolloutControl: { mode: 'canary', canary_listing_id: 'listing-1' }, listing: { id: 'listing-2' } }).enabled, false)
  assert.equal(resolveSellerDocumentTaxonomyProjectionRollout({ rolloutControl: { mode: 'canary', canary_listing_id: 'listing-1' }, listing: { id: 'listing-1' } }).enabled, true)
  assert.equal(resolveSellerDocumentTaxonomyProjectionRollout({ rolloutControl: { mode: 'enabled' }, listing: { id: 'listing-2' } }).enabled, true)
})

test('comparison proves levy deduplication, solar categorisation, and fact-row removal', () => {
  const comparison = buildSellerDocumentTaxonomyComparison({ legacyRows: rows })
  assert.equal(comparison.legacy.rowCount, 4)
  assert.equal(comparison.canonical.rowCount, 2)
  assert.equal(comparison.delta.removedDuplicateCount, 2)
  assert.equal(comparison.delta.hiddenStructuredFactCount, 1)
  assert.equal(comparison.canonical.audit.findings.find((finding) => finding.canonicalKey === 'solar_compliance_documents')?.category, 'property_compliance')

  const paused = projectSellerDocumentRowsForTaxonomyRollout({ rows, rolloutControl: { mode: 'paused' }, listing: { id: 'listing-1' } })
  const enabled = projectSellerDocumentRowsForTaxonomyRollout({ rows, rolloutControl: { mode: 'canary', canary_listing_id: 'listing-1' }, listing: { id: 'listing-1' } })
  assert.equal(paused.rows.length, 4)
  assert.equal(enabled.rows.length, 2)
})

test('covers freehold, sectional-title, HOA, bond, tenancy, solar, and legacy/canonical mixtures', () => {
  const variants = [
    { key: 'rates_account', listingId: 'freehold', partyId: 'seller' },
    { key: 'sectional_levy_statement', listingId: 'sectional', partyId: 'seller' },
    { key: 'body_corporate_details', listingId: 'sectional', partyId: 'seller' },
    { key: 'hoa_levy_statement', listingId: 'hoa', partyId: 'seller' },
    { key: 'hoa_contact_details', listingId: 'hoa', partyId: 'seller' },
    { key: 'bond_statement', listingId: 'bond', partyId: 'seller' },
    { key: 'lease_agreement', listingId: 'tenancy', partyId: 'seller' },
    { key: 'solar_compliance_documents', listingId: 'solar', partyId: 'seller' },
    { key: 'levy_statement', listingId: 'sectional', partyId: 'seller' },
  ]
  const projected = projectSellerDocumentRowsForTaxonomyRollout({
    rows: variants,
    rolloutControl: { mode: 'enabled' },
    listing: { id: 'sectional' },
  }).rows
  assert.equal(projected.filter((row) => row.key === 'levy_statement').length, 1)
  assert.equal(projected.some((row) => row.key === 'body_corporate_details'), false)
  assert.equal(projected.some((row) => row.key === 'hoa_details'), false)
  assert.equal(projected.find((row) => row.key === 'solar_compliance_documents')?.taxonomyCategory, 'property')
  for (const expected of ['rates_account', 'hoa_levy_statement', 'bond_statement', 'lease_agreement']) {
    assert.ok(projected.some((row) => row.key === expected), `${expected} should remain an uploadable document`)
  }
})

test('keeps digital/manual routes and a correction after one signature in explicit states', () => {
  assert.equal(buildSellerSigningStatusModel({ onboardingSubmitted: true, mandateStatus: 'sent', mandateExecutionMode: 'digital' }).mandate.status, 'sent_for_signature')
  assert.equal(buildSellerSigningStatusModel({ onboardingSubmitted: true, mandateStatus: 'sent', mandateExecutionMode: 'manual' }).mandate.status, 'awaiting_signed_hard_copy')
  const signed = createSellerOnboardingSigningLifecycle({ stage: SELLER_ONBOARDING_SIGNING_STAGES.partiallySigned, actor: 'primary-seller' })
  const correction = createSellerOnboardingSigningLifecycle({ existing: signed, stage: SELLER_ONBOARDING_SIGNING_STAGES.correctionRequested, actor: 'agent', metadata: { reason: 'Correct property extent' } })
  assert.equal(correction.stage, SELLER_ONBOARDING_SIGNING_STAGES.correctionRequested)
  assert.equal(correction.history.length, 2)
  assert.equal(correction.history[0].stage, SELLER_ONBOARDING_SIGNING_STAGES.partiallySigned)
})
