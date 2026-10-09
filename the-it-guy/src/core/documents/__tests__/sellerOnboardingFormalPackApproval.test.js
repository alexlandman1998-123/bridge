import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSellerOnboardingFormalPackApproval,
  validateSellerOnboardingFormalPackApproval,
} from '../sellerOnboardingFormalPackApproval.js'

test('requires agent review and mandate commercial terms before approval', () => {
  const invalid = validateSellerOnboardingFormalPackApproval({
    reviewApproved: true,
    selectedDocuments: ['fica', 'mandate'],
    commission: { basis: 'percentage', percentage: '', vatHandling: '' },
  })
  assert.equal(invalid.valid, false)
  assert.deepEqual(invalid.missing, ['Commission percentage', 'VAT treatment'])
})

test('records the approved route and frozen commission terms', () => {
  const approval = createSellerOnboardingFormalPackApproval({
    reviewApproved: true,
    selectedDocuments: ['fica', 'mandate'],
    commission: { basis: 'fixed', amount: '50000', vatHandling: 'inclusive' },
    signingRoute: 'manual_upload',
    actor: 'agent-1',
    at: '2026-09-19T10:00:00.000Z',
  })
  assert.equal(approval.status, 'approved')
  assert.equal(approval.signingRoute, 'manual_upload')
  assert.equal(approval.commission.amount, '50000')
  assert.equal(approval.commission.confirmed, true)
  assert.equal(approval.history.length, 1)
})


test('records the agency-upload choice without approving its mandate or confirming unset commercial terms', () => {
  const input = { reviewApproved: true, selectedDocuments: ['fica'], signingRoute: 'manual_upload', mandateSource: 'agency_upload', actor: 'agent-1' }
  const approval = createSellerOnboardingFormalPackApproval(input)
  assert.equal(approval.mandateSource, 'agency_upload')
  assert.equal(approval.history[0].mandateSource, 'agency_upload')
  assert.deepEqual(approval.selectedDocuments, ['fica'])
  assert.equal(approval.commission.confirmed, false)
  assert.throws(() => createSellerOnboardingFormalPackApproval({ ...input, reviewApproved: false }), /Approve seller onboarding/)
  assert.throws(() => createSellerOnboardingFormalPackApproval({ ...input, selectedDocuments: ['fica', 'mandate'] }), /Upload the agency mandate separately/)
  assert.throws(() => createSellerOnboardingFormalPackApproval({ ...input, selectedDocuments: [] }), /Include FICA/)
  assert.throws(() => createSellerOnboardingFormalPackApproval({ ...input, mandateSource: 'unknown' }), /Choose a mandate document source/)
})

test('preparing only FICA preserves prior mandate commission and agency-document choice', () => {
  const approval = createSellerOnboardingFormalPackApproval({
    existing: { mandateSource: 'agency_upload', commission: { confirmed: true, basis: 'fixed', amount: '75000', vatHandling: 'inclusive' } },
    reviewApproved: true, selectedDocuments: ['fica'], signingRoute: 'digital_pack', commission: {},
    documentRoutes: { signed_fica_declaration: 'digital_pack' }, actor: 'agent',
  })
  assert.equal(approval.mandateSource, 'agency_upload')
  assert.equal(approval.commission.amount, '75000')
  assert.equal(approval.commission.confirmed, true)
  assert.deepEqual(approval.selectedDocuments, ['fica'])
})
