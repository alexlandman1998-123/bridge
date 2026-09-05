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
