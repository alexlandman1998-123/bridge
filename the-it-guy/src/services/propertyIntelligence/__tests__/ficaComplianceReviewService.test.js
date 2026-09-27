import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFicaCompliancePanel, getFicaCertificateGenerationAvailability, hasCompletedFicaProviderEvidence } from '../ficaComplianceReviewService.js'

test('FICA review requires evidence, a provider result, and staff approval before a certificate', () => {
  const compliance = { declaration: { status: 'signed' }, documents: { checklist: { identity: 'verified' } }, verification: { status: 'completed', reference: 'UAT-REFERENCE', completedAt: '2026-09-27T08:00:00Z' }, approval: { status: 'approved' } }
  assert.equal(buildFicaCompliancePanel(compliance).readyForApproval, true)
  assert.deepEqual(getFicaCertificateGenerationAvailability(compliance), { enabled: true, reason: '' })
})

test('a completed status without a provider reference and completion time is not verification', () => {
  const compliance = { declaration: { status: 'signed' }, documents: { checklist: { identity: 'verified' } }, verification: { status: 'completed' }, approval: { status: 'approved' } }
  assert.equal(buildFicaCompliancePanel(compliance).readyForApproval, false)
  assert.equal(getFicaCertificateGenerationAvailability(compliance).enabled, false)
  assert.equal(hasCompletedFicaProviderEvidence(compliance.verification), false)
  assert.equal(hasCompletedFicaProviderEvidence({ ...compliance.verification, reference: 'UAT-REFERENCE', completedAt: 'invalid' }), false)
})

test('a current certificate is never replaced through the generation path', () => {
  const availability = getFicaCertificateGenerationAvailability({ approval: { status: 'approved' }, certificate: { documentId: 'certificate-1' } })
  assert.equal(availability.enabled, false)
  assert.match(availability.reason, /already exists/)
})
