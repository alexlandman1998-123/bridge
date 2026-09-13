import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKnowledgeFactoryFicaHandoff, getKnowledgeFactoryFicaVerificationAvailability } from '../knowledgeFactoryFicaVerificationService.js'

test('a FICA provider handoff needs declaration, supporting documents and a real context', () => {
  const handoff = buildKnowledgeFactoryFicaHandoff({ organisationId: 'org-1', party: 'buyer', partyType: 'individual', transactionId: 'tx-1', documentReadiness: { declarationReady: true, supportingDocumentsReady: true } })
  assert.equal(handoff.complete, true)
  assert.equal(getKnowledgeFactoryFicaVerificationAvailability(handoff).enabled, false)
  assert.equal(getKnowledgeFactoryFicaVerificationAvailability(handoff).status, 'not_configured')
  assert.equal(buildKnowledgeFactoryFicaHandoff({ party: 'buyer' }).complete, false)
})
