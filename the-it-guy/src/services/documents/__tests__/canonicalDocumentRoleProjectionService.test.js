import { expect, test } from 'vitest'
import {
  buildCanonicalDocumentWorkspaceModel,
  getCanonicalRoleProjectionPolicy,
} from '../canonicalDocumentWorkspaceService.js'
import { buildCanonicalBuyerDocumentCenter, buildCanonicalSellerDocumentCenter } from '../../clientPortalWorkspaceService.js'
import { mergeProjectedDocuments, projectMatterDocumentRequirements } from '../transactionDocumentProjection.js'

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

test('buyer, seller, and matter views retain the same canonical identities and file references', () => {
  const requirements = [
    {
      id: 'buyer-requirement', transaction_id: 'transaction-1', context_type: 'transaction', context_id: 'transaction-1',
      document_definition_key: 'buyer_id_document', pack_key: 'buyer_identity_fica', requested_from_role: 'buyer',
      visible_to_roles: ['buyer', 'transfer_attorney'], uploadable_by_roles: ['buyer'],
      status: 'under_review', requirement_level: 'blocker', satisfied_by_document_id: 'buyer-file',
      document_definitions: { display_label: 'Buyer ID' },
    },
    {
      id: 'seller-requirement', transaction_id: 'transaction-1', context_type: 'transaction', context_id: 'transaction-1',
      document_definition_key: 'seller_id_document', pack_key: 'seller_identity_fica', requested_from_role: 'seller',
      visible_to_roles: ['seller', 'transfer_attorney'], uploadable_by_roles: ['seller'],
      status: 'approved', requirement_level: 'required', satisfied_by_document_id: 'seller-file',
      document_definitions: { display_label: 'Seller ID' },
    },
  ]
  const documents = [
    { id: 'buyer-file', canonical_requirement_instance_id: 'buyer-requirement' },
    { id: 'seller-file', canonical_requirement_instance_id: 'seller-requirement' },
  ]
  const buyer = buildCanonicalBuyerDocumentCenter({ requirements: [requirements[0]], documents: [documents[0]] })
  const seller = buildCanonicalSellerDocumentCenter({ requirements: [requirements[1]], documents: [documents[1]] })
  const matter = projectMatterDocumentRequirements({ requirements, documents })
  const matterFiles = mergeProjectedDocuments([], { requirements, documents })

  expect(buyer.requiredDocuments.map((row) => [row.canonicalRequirementInstanceId, row.linkedDocument?.id]))
    .toEqual([['buyer-requirement', 'buyer-file']])
  expect(seller.requiredDocuments.map((row) => [row.canonicalRequirementInstanceId, row.linkedDocument?.id]))
    .toEqual([['seller-requirement', 'seller-file']])
  expect(matter.map((row) => [row.canonicalRequirementInstanceId, row.uploadedDocumentId]))
    .toEqual([['buyer-requirement', 'buyer-file'], ['seller-requirement', 'seller-file']])
  expect(matterFiles.map((row) => row.id)).toEqual(['buyer-file', 'seller-file'])
})
