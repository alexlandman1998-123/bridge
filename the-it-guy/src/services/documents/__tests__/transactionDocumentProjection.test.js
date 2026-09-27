import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mergeProjectedDocuments,
  projectMatterDocumentRequirements,
} from '../transactionDocumentProjection.js'
import { buildMatterDocumentWorkspaceModel } from '../matterDocumentWorkspaceModel.js'

test('professional checklist is sourced only from the canonical transaction projection', () => {
  const projection = {
    requirements: [{
      id: 'canonical-buyer-id',
      document_definition_key: 'buyer_id_document',
      pack_key: 'buyer_identity_fica',
      requested_from_role: 'buyer',
      status: 'under_review',
      requirement_level: 'blocker',
      satisfied_by_document_id: 'buyer-id-file',
      document_definitions: { display_label: 'Buyer ID' },
    }],
    documents: [{ id: 'buyer-id-file', canonical_requirement_instance_id: 'canonical-buyer-id' }],
  }
  const rows = projectMatterDocumentRequirements(projection)
  const model = buildMatterDocumentWorkspaceModel({
    transaction: { id: 'transaction-1' },
    requiredDocumentChecklist: rows,
    documents: mergeProjectedDocuments([], projection),
  })
  assert.equal(model.requiredRows.length, 1)
  assert.equal(model.requiredRows[0].id, 'canonical-buyer-id')
  assert.equal(model.requiredRows[0].status, 'pending_review')
  assert.equal(model.requiredRows[0].linkedDocument.id, 'buyer-id-file')
  assert.equal(model.requiredRows[0].blocksStage, true)
  assert.deepEqual(projectMatterDocumentRequirements({ requirements: [] }), [])
  assert.equal(projectMatterDocumentRequirements(null), null)
})

test('the richer authorised document record wins over projection metadata for the same file', () => {
  const documents = mergeProjectedDocuments(
    [{ id: 'file-1', name: 'Full document', url: '/signed/file-1' }],
    { documents: [{ id: 'file-1', name: 'Projection metadata' }] },
  )
  assert.deepEqual(documents, [{ id: 'file-1', name: 'Full document', url: '/signed/file-1' }])
})
