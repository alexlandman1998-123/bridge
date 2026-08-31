import { expect, test } from 'vitest'
import { buildCanonicalDocumentWorkspaceModel } from '../canonicalDocumentWorkspaceService.js'

const definition = {
  key: 'buyer_id_document',
  display_label: 'Buyer ID / Passport',
  pack_key: 'buyer_identity_fica',
  default_visibility: ['buyer', 'agent', 'developer', 'attorney'],
  default_upload_roles: ['buyer'],
}

test('workspace collapses role-only duplicates and preserves the uploaded state', () => {
  const model = buildCanonicalDocumentWorkspaceModel({
    role: 'buyer',
    documentCenter: {
      uploadedDocuments: [{
        id: 'document-1',
        canonical_requirement_instance_id: 'uploaded-instance',
        file_path: 'client-portal/transaction-1/buyer-id.pdf',
      }],
    },
    requirements: [
      {
        id: 'missing-instance',
        context_type: 'transaction',
        context_id: 'transaction-1',
        document_definition_key: 'buyer_id_document',
        requested_from_role: 'client',
        status: 'pending',
        document_definitions: definition,
      },
      {
        id: 'uploaded-instance',
        context_type: 'transaction',
        context_id: 'transaction-1',
        document_definition_key: 'buyer_id_document',
        requested_from_role: 'buyer',
        status: 'under_review',
        satisfied_by_document_id: 'document-1',
        document_definitions: definition,
      },
    ],
  })

  expect(model.requirements).toHaveLength(1)
  expect(model.requirements[0].id).toBe('uploaded-instance')
  expect(model.requirements[0].status).toBe('under_review')
  expect(model.requirements[0].hasLinkedDocument).toBe(true)
})

test('workspace never renders retired forms or aggregate FICA containers', () => {
  const model = buildCanonicalDocumentWorkspaceModel({
    role: 'buyer',
    requirements: ['information_sheet', 'buyer_fica_pack', 'seller_fica_pack'].map((key) => ({
      id: `${key}-instance`,
      context_type: 'transaction',
      context_id: 'transaction-1',
      document_definition_key: key,
      status: 'pending',
      visible_to_roles: ['buyer'],
      document_definitions: {
        key,
        display_label: key,
        pack_key: 'buyer_identity_fica',
        default_visibility: ['buyer'],
        default_upload_roles: ['buyer'],
      },
    })),
  })

  expect(model.requirements).toHaveLength(0)
  expect(model.hasRequirements).toBe(false)
})
