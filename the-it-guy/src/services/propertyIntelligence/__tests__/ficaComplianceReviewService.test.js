import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFicaCompliancePanel, getFicaCertificateGenerationAvailability } from '../ficaComplianceReviewService.js'

test('FICA review requires evidence, a provider result, and staff approval before a certificate', () => {
  const compliance = { declaration: { status: 'signed' }, documents: { checklist: { identity: 'verified' } }, verification: { status: 'completed' }, approval: { status: 'approved' } }
  assert.equal(buildFicaCompliancePanel(compliance).readyForApproval, true)
  assert.deepEqual(getFicaCertificateGenerationAvailability(compliance), { enabled: true, reason: '' })
})

test('a current certificate is never replaced through the generation path', () => {
  const availability = getFicaCertificateGenerationAvailability({ approval: { status: 'approved' }, certificate: { documentId: 'certificate-1' } })
  assert.equal(availability.enabled, false)
  assert.match(availability.reason, /already exists/)
})
