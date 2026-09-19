import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingCorrectionControl, recordSellerOnboardingCorrectionResubmission } from '../sellerOnboardingCorrectionControl.js'

test('archives invalidated pack metadata without retaining signing links or document HTML', () => {
  const control = createSellerOnboardingCorrectionControl({
    reason: 'Correct the commission amount.', actor: 'agent-1', at: '2026-09-19T12:00:00.000Z',
    formData: {
      sellerOnboardingFormalPackApproval: { status: 'approved', signingRoute: 'digital_pack', selectedDocuments: ['fica', 'mandate'], commission: { confirmed: true } },
      sellerOnboardingFormalPackDispatch: { status: 'sent', signingGroupId: 'group-1', signingLink: 'secret-link', recipientCount: 1 },
      sellerOnboardingManualSigningPack: { status: 'awaiting_signed_hard_copy', documents: [{ key: 'signed_mandate', generatedHtml: '<html>secret</html>', generatedFileName: 'mandate.pdf' }] },
    },
  })
  assert.equal(control.status, 'correction_requested')
  assert.equal(control.history[0].supersededDispatch.signingGroupId, 'group-1')
  assert.equal(JSON.stringify(control).includes('secret-link'), false)
  assert.equal(JSON.stringify(control).includes('<html>secret'), false)
})

test('requires an explanatory correction reason', () => {
  assert.throws(() => createSellerOnboardingCorrectionControl({ reason: 'no' }), /short reason/)
})

test('marks the correction audit as resubmitted while retaining its history', () => {
  const control = recordSellerOnboardingCorrectionResubmission({ existing: { status: 'correction_requested', history: [{ status: 'correction_requested' }] }, at: '2026-09-19T12:10:00.000Z' })
  assert.equal(control.status, 'resubmitted')
  assert.equal(control.history.at(-1).status, 'resubmitted')
})
