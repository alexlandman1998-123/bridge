import test from 'node:test'
import assert from 'node:assert/strict'
import { assessFinalSurfaceCompletion } from '../finalSurfaceCompletion.js'

const packet = { packetType: 'otp' }
const version = { id: 'version-1' }
const document = { id: 'document-1' }
const publication = { id: 'publication-1' }
const receipt = { packetVersionId: 'version-1', documentId: 'document-1', publicationId: 'publication-1', canonicalDocumentKey: 'signed_otp', canonicalRequirementInstanceId: 'requirement-1', transactionVisible: true, clientVisible: true, canonicalSatisfied: true }
const requirement = { id: 'requirement-1', status: 'completed', satisfiedByDocumentId: 'document-1' }

test('accepts completed transaction, portal and canonical surfaces', () => {
  assert.equal(assessFinalSurfaceCompletion({ packet, version, document, publication, receipt, requirement }).ready, true)
})

test('rejects an outstanding canonical requirement', () => {
  const result = assessFinalSurfaceCompletion({ packet, version, document, publication, receipt, requirement: { ...requirement, status: 'pending' } })
  assert.ok(result.reasons.includes('F4_REQUIREMENT_BINDING_INVALID'))
})

test('rejects a document hidden from clients', () => {
  const result = assessFinalSurfaceCompletion({ packet, version, document, publication, receipt: { ...receipt, clientVisible: false }, requirement })
  assert.ok(result.reasons.includes('F4_SURFACE_VISIBILITY_INCOMPLETE'))
})
