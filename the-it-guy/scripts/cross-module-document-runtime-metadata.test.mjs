import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { resolvePortalDocumentMetadata } = await server.ssrLoadModule('/src/core/documents/portalDocumentMetadata.js')
  const { getBuyerRequirementProfile } = await server.ssrLoadModule('/src/lib/buyerRequirementEngine.js')
  const { buildCanonicalDocumentWorkspaceModel } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentWorkspaceService.js')
  const { mapProjectionRowToRequirement } = await server.ssrLoadModule('/src/services/documents/transactionCanonicalDocumentRequirementService.js')

  const sellerAddressMetadata = resolvePortalDocumentMetadata({
    document_key: 'proof_of_address',
    group_key: 'seller_identity_fica',
    required_from_role: 'seller',
    label: 'Proof of Address',
  })
  assert.equal(sellerAddressMetadata.canonicalDocumentKey, 'seller_proof_of_address')
  assert.equal(sellerAddressMetadata.documentOwnerRole, 'seller')
  assert.equal(sellerAddressMetadata.documentPackKey, 'seller_identity_fica')
  assert.equal(sellerAddressMetadata.portalWorkspaceCategory, 'fica')

  const buyerAddressMetadata = resolvePortalDocumentMetadata({
    document_key: 'proof_of_address',
    group_key: 'buyer_fica',
    required_from_role: 'buyer',
    label: 'Proof of Address',
  })
  assert.equal(buyerAddressMetadata.canonicalDocumentKey, 'buyer_proof_of_address')
  assert.equal(buyerAddressMetadata.documentOwnerRole, 'buyer')
  assert.equal(buyerAddressMetadata.portalWorkspaceCategory, 'fica')

  const buyerProfile = getBuyerRequirementProfile({
    transaction: {
      purchaser_type: 'company',
      finance_type: 'cash',
    },
    formData: {
      purchaser_type: 'company',
      purchase_finance_type: 'cash',
    },
  })
  const companyRegistration = buyerProfile.requiredDocuments.find((item) => item.key === 'cipc_registration')
  assert.equal(Boolean(companyRegistration), true)
  assert.equal(companyRegistration.canonicalDocumentKey, 'buyer_company_registration')
  assert.equal(companyRegistration.documentOwnerRole, 'buyer')
  assert.equal(companyRegistration.documentPackKey, 'buyer_identity_fica')

  const sellerWorkspace = buildCanonicalDocumentWorkspaceModel({
    role: 'seller',
    requirements: [
      {
        id: 'seller-address-requirement',
        document_definition_key: 'proof_of_address',
        pack_key: 'seller_identity_fica',
        status: 'pending',
        requirement_level: 'required',
        requested_from_role: 'seller',
        visible_to_roles: ['seller', 'agent'],
        uploadable_by_roles: ['seller'],
        document_definitions: {
          key: 'proof_of_address',
          display_label: 'Proof of Address',
        },
      },
    ],
    documentCenter: {},
  })
  assert.equal(sellerWorkspace.requirements[0].canonicalDocumentKey, 'seller_proof_of_address')
  assert.equal(sellerWorkspace.requirements[0].documentOwnerRole, 'seller')
  assert.equal(sellerWorkspace.requirements[0].documentPackKey, 'seller_identity_fica')

  const bondInstructionRequirement = mapProjectionRowToRequirement({
    id: 'row-bond-instruction',
    transaction_id: 'tx-1',
    document_key: 'bond_instruction',
    document_name: 'Bond Instruction',
    document_category: 'bond_documents',
    requested_from: 'bond_originator',
    responsible_role: 'bond_originator',
    visible_section: 'bond_registration_documents',
    debug_group_key: 'bond_registration',
    status: 'pending',
    required: true,
    blocking: true,
    source: 'attorney_document_requirements_adapter',
    rule_id: 'adapter:attorney_document_requirements:bond_instruction',
  })
  assert.equal(bondInstructionRequirement.key, 'bond_instruction')
  assert.equal(bondInstructionRequirement.canonicalDocumentKey, 'bond_instruction_to_attorneys')
  assert.equal(bondInstructionRequirement.documentOwnerRole, 'bond_originator')
  assert.equal(bondInstructionRequirement.documentResponsibleRoles.includes('bond_attorney'), true)
  assert.equal(bondInstructionRequirement.debugTrace.canonicalDocumentKey, 'bond_instruction_to_attorneys')

  console.log('cross-module document runtime metadata tests passed')
} finally {
  await server.close()
}
