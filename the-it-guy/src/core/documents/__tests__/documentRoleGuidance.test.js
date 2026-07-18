import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentRoleGuidance, resolveDocumentAudience } from '../documentRoleGuidance.js'

test('normalizes the principal, agent, attorney, buyer and seller audiences', () => {
  assert.equal(resolveDocumentAudience('agency_admin'), 'principal')
  assert.equal(resolveDocumentAudience('estate_agent'), 'agent')
  assert.equal(resolveDocumentAudience('transfer_attorney'), 'attorney')
  assert.equal(resolveDocumentAudience('purchaser_1'), 'buyer')
  assert.equal(resolveDocumentAudience('seller_spouse'), 'seller')
})

test('gives an agent practical follow-up guidance without resending completed parties', () => {
  const guidance = buildDocumentRoleGuidance({ surface: 'workspace', role: 'agent', packetType: 'mandate', state: 'partially_signed' })
  assert.equal(guidance.audience, 'agent')
  assert.match(guidance.nextAction, /timeline/i)
  assert.ok(guidance.steps.some((step) => /already signed/i.test(step)))
})

test('gives an attorney review guidance without inventing an approval gate', () => {
  const guidance = buildDocumentRoleGuidance({ surface: 'workspace', role: 'attorney', packetType: 'otp', state: 'draft' })
  assert.match(guidance.title, /review and tailor/i)
  assert.match(guidance.nextAction, /generate/i)
  assert.equal(JSON.stringify(guidance).toLowerCase().includes('approval required'), false)
})

test('guides seller and buyer signers through the three-step portal flow', () => {
  for (const role of ['seller', 'purchaser_1']) {
    const guidance = buildDocumentRoleGuidance({ surface: 'signer_portal', role, packetType: 'otp', signerStatus: 'viewed', remainingFields: 2, completedFields: 1 })
    assert.equal(guidance.steps.length, 3)
    assert.match(guidance.nextAction, /next highlighted field/i)
  }
})

test('shows completion guidance only after signer evidence exists', () => {
  const empty = buildDocumentRoleGuidance({ surface: 'signer_portal', role: 'seller', remainingFields: 0, completedFields: 0, signerStatus: 'sent' })
  const complete = buildDocumentRoleGuidance({ surface: 'signer_portal', role: 'seller', remainingFields: 0, completedFields: 2, signerStatus: 'signed' })
  assert.notEqual(empty.tone, 'success')
  assert.equal(complete.tone, 'success')
})
