import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingFormalPackDispatch } from '../sellerOnboardingFormalPackDispatch.js'

const approval = { status: 'approved' }

test('records digital delivery without retaining signer links or treating it as a signature', () => {
  const dispatch = createSellerOnboardingFormalPackDispatch({
    formalPackApproval: approval,
    selectedDocuments: ['fica', 'mandate'],
    actor: 'agent-1',
    at: '2026-09-19T10:30:00.000Z',
    response: {
      delivery: 'partial',
      signingGroupId: 'group-1',
      correctedSigningGroupId: 'signed-group-1',
      isAmendment: true,
      signedSessionsRetained: 1,
      expiresAt: '2026-09-26T10:30:00.000Z',
      signingLinks: [
        { signerName: 'Alex', signerEmail: 'alex@example.com', delivery: 'sent', signingLink: 'secret-1' },
        { signerName: 'Sam', signerEmail: 'sam@example.com', delivery: 'failed', signingLink: 'secret-2' },
      ],
    },
  })
  assert.equal(dispatch.status, 'partial')
  assert.equal(dispatch.deliveredRecipientCount, 1)
  assert.equal(dispatch.recipientCount, 2)
  assert.equal(dispatch.signingGroupId, 'group-1')
  assert.equal(dispatch.supersededSigningGroupId, 'signed-group-1')
  assert.equal(dispatch.isAmendment, true)
  assert.equal(dispatch.signedSessionsRetained, 1)
  assert.equal('signingLink' in dispatch.recipients[0], false)
  assert.equal(JSON.stringify(dispatch).includes('secret-1'), false)
  assert.equal(JSON.stringify(dispatch).includes('signedAt'), false)
})

test('rejects a digital dispatch without phase-four approval or recipient evidence', () => {
  assert.throws(() => createSellerOnboardingFormalPackDispatch({
    formalPackApproval: {},
    response: { signingLinks: [{ signerEmail: 'seller@example.com', delivery: 'sent' }] },
  }), /Approve the onboarding/)
  assert.throws(() => createSellerOnboardingFormalPackDispatch({
    formalPackApproval: approval,
    response: { delivery: 'sent', signingLinks: [] },
  }), /recipient delivery records/)
})
