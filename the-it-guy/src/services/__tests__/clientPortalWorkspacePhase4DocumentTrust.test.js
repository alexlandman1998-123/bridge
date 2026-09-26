import { expect, test } from 'vitest'
import { buildCanonicalBuyerDocumentCenter } from '../clientPortalWorkspaceService.js'

test('Phase 4 buyer document centre uses only exact canonical projection documents', () => {
  const centre = buildCanonicalBuyerDocumentCenter({
    requirements: [{
      id: 'buyer-requirement',
      document_definition_key: 'buyer_id_document',
      pack_key: 'buyer_identity_fica',
      status: 'pending',
      uploadable_by_roles: ['buyer'],
      document_definitions: { display_label: 'Buyer ID', description: 'Identity document.' },
    }],
    documents: [{
      id: 'unrelated-document',
      canonical_requirement_instance_id: 'other-requirement',
      document_type: 'buyer_id_document',
      is_client_visible: true,
    }],
  })

  expect(centre.canonicalOnly).toBe(true)
  expect(centre.requiredDocuments).toHaveLength(1)
  expect(centre.requiredDocuments[0]).toMatchObject({
    status: 'required',
    hasUploadedDocument: false,
    linkedDocument: null,
    authoritativeSource: 'canonical_projection',
  })
  expect(centre.requiredDocuments[0].uploadSpec).toMatchObject({
    requirementInstanceId: 'buyer-requirement',
  })
})

test('Phase 4 fails closed when the buyer projection is unavailable', () => {
  const centre = buildCanonicalBuyerDocumentCenter(null, 'RPC missing')
  expect(centre).toMatchObject({
    canonicalOnly: true,
    requiredDocuments: [],
  })
  expect(centre.loadError).toContain('secure document room')
})

test('unmatched agent evidence is visible but never satisfies a buyer requirement', () => {
  const centre = buildCanonicalBuyerDocumentCenter({
    requirements: [{
      id: 'buyer-requirement',
      document_definition_key: 'buyer_id_document',
      pack_key: 'buyer_identity_fica',
      status: 'pending',
      uploadable_by_roles: ['buyer'],
      document_definitions: { display_label: 'Buyer ID' },
    }],
    documents: [{
      id: 'agent-document',
      name: 'id.pdf',
      document_type: 'buyer_id_document',
      status: 'uploaded',
      source: 'agent_buyer_document_upload',
      canonical_requirement_instance_id: null,
    }],
  })

  expect(centre.requiredDocuments[0]).toMatchObject({ status: 'required', hasUploadedDocument: false })
  expect(centre.unmatchedDocuments).toHaveLength(1)
  expect(centre.unmatchedDocuments[0]).toMatchObject({ awaitingRequirementMatch: true, status: 'uploaded' })
  expect(centre.summary).toMatchObject({ outstanding: 1, uploaded: 1 })
})

test('additional-request buyer uploads remain visible without being mislabelled as unmatched agent evidence', () => {
  const centre = buildCanonicalBuyerDocumentCenter({
    requirements: [],
    documents: [{
      id: 'requested-document', name: 'bank-letter.pdf', status: 'uploaded',
      source: 'client_portal_requested_document_upload',
      canonical_requirement_instance_id: null,
    }],
  })
  expect(centre.standaloneDocuments).toHaveLength(1)
  expect(centre.unmatchedDocuments).toHaveLength(0)
  expect(centre.items[0]).toMatchObject({ status: 'uploaded', awaitingRequirementMatch: false })
})
