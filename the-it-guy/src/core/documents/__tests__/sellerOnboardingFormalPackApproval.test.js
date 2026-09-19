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
