import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKnowledgeFactoryFicaHandoff, getKnowledgeFactoryFicaVerificationAvailability } from '../knowledgeFactoryFicaVerificationService.js'
import { buildFicaCompliancePanel } from '../ficaComplianceReviewService.js'

test('a FICA provider handoff needs declaration, supporting documents and a real context', () => {
  const handoff = buildKnowledgeFactoryFicaHandoff({ organisationId: 'org-1', party: 'buyer', partyType: 'individual', transactionId: 'tx-1', documentReadiness: { declarationReady: true, supportingDocumentsReady: true } })
  assert.equal(handoff.complete, true)
  assert.equal(getKnowledgeFactoryFicaVerificationAvailability(handoff).enabled, false)
  assert.equal(getKnowledgeFactoryFicaVerificationAvailability(handoff).status, 'not_configured')
  assert.equal(buildKnowledgeFactoryFicaHandoff({ party: 'buyer' }).complete, false)
})

test('a complete document pack cannot become approved without a supplier result', () => {
  const panel = buildFicaCompliancePanel({
    declaration: { status: 'signed' },
    documents: { checklist: { identity: 'received', proof_of_address: 'received' } },
    verification: { status: 'not_configured', reason: 'Supplier verification has not run.' },
    approval: { status: 'approved' },
  })
  assert.equal(panel.steps.find((step) => step.label === 'Provider').status, 'action_required')
  assert.equal(panel.readyForApproval, false)
  assert.equal(panel.certificate.status, 'unavailable')
})
