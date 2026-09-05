import { expect, test } from 'vitest'
import {
  buildCanonicalDocumentWorkspaceModel,
  getCanonicalRoleProjectionPolicy,
} from '../canonicalDocumentWorkspaceService.js'

test('generic client visibility is scoped to the party asked to provide the document', () => {
  expect(getCanonicalRoleProjectionPolicy({
    role: 'buyer',
    visibleToRoles: ['client'],
    uploadableByRoles: ['client'],
    requestedFromRole: 'seller',
  })).toMatchObject({ visible: false, uploadable: false })

  expect(getCanonicalRoleProjectionPolicy({
    role: 'buyer',
    visibleToRoles: ['client'],
    uploadableByRoles: ['client'],
    requestedFromRole: 'buyer',
  })).toMatchObject({ visible: true, uploadable: true })
})

test('a document only satisfies the requirement it is canonically linked to', () => {
  const model = buildCanonicalDocumentWorkspaceModel({
    role: 'buyer',
    documentCenter: {
      uploadedDocuments: [{
        id: 'seller-id-document',
        document_type: 'buyer_id_document',
        category: 'buyer_identity_fica',
        canonical_requirement_instance_id: 'seller-requirement',
        file_path: 'documents/transaction/seller-id.pdf',
        is_client_visible: true,
      }],
    },
    requirements: [{
      id: 'buyer-requirement',
      context_type: 'transaction',
      context_id: 'transaction-1',
      document_definition_key: 'buyer_id_document',
      status: 'pending',
      visible_to_roles: ['buyer'],
      uploadable_by_roles: ['buyer'],
      document_definitions: {
        key: 'buyer_id_document',
        display_label: 'Buyer ID',
        pack_key: 'buyer_identity_fica',
      },
    }],
  })

  expect(model.requirements).toHaveLength(1)
  expect(model.requirements[0]).toMatchObject({
    status: 'pending',
    hasLinkedDocument: false,
    canOpenDocument: false,
  })
})

test('a buyer cannot open an internal document even when it has an exact link', () => {
  const model = buildCanonicalDocumentWorkspaceModel({
    role: 'buyer',
    documentCenter: {
      uploadedDocuments: [{
        id: 'document-1',
        canonical_requirement_instance_id: 'buyer-requirement',
        file_path: 'documents/transaction/buyer-id.pdf',
        visibility_scope: 'internal',
        is_client_visible: false,
      }],
    },
    requirements: [{
      id: 'buyer-requirement',
      context_type: 'transaction',
      context_id: 'transaction-1',
      document_definition_key: 'buyer_id_document',
      status: 'uploaded',
      visible_to_roles: ['buyer'],
      document_definitions: {
        key: 'buyer_id_document',
        display_label: 'Buyer ID',
        pack_key: 'buyer_identity_fica',
      },
    }],
  })

  expect(model.requirements[0]).toMatchObject({
    hasLinkedDocument: true,
    canOpenDocument: false,
  })
})
