import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildCanonicalDocumentWorkspaceModel,
    getRequirementUploadState,
    isCanonicalDocumentWorkspaceEnabled,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentWorkspaceService.js')

  const requirements = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      document_definition_key: 'signed_mandate',
      pack_key: 'seller_authority',
      requirement_level: 'blocker',
      status: 'pending',
      stage_gates: ['mandate_ready', 'listing_ready'],
      requested_from_role: 'seller',
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
      document_definitions: {
        key: 'signed_mandate',
        display_label: 'Signed Mandate',
        description: 'Required before listing activation.',
        default_requirement_level: 'blocker',
      },
      document_packs: {
        key: 'seller_authority',
        display_label: 'Seller Authority',
        description: 'Authority to market and sell.',
        sort_order: 20,
      },
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      document_definition_key: 'bond_statement',
      pack_key: 'property_finance_existing_bond',
      requirement_level: 'required',
      status: 'requested',
      stage_gates: ['attorney_instruction_ready'],
      requested_from_role: 'seller',
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
      rejection_reason: '',
      document_definitions: {
        key: 'bond_statement',
        display_label: 'Bond Statement',
        description: 'Required because the seller indicated an existing bond.',
        default_requirement_level: 'required',
      },
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      document_definition_key: 'lease_agreement',
      pack_key: 'tenant_occupancy',
      requirement_level: 'blocker',
      status: 'rejected',
      stage_gates: ['attorney_instruction_ready'],
      requested_from_role: 'seller',
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
      rejection_reason: 'The lease copy is incomplete.',
      document_definitions: {
        key: 'lease_agreement',
        display_label: 'Lease Agreement',
        description: 'Required because the property is tenant occupied.',
      },
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      document_definition_key: 'internal_note',
      pack_key: 'attorney_transfer_readiness',
      requirement_level: 'optional',
      status: 'pending',
      visible_to_roles: ['agent'],
      uploadable_by_roles: ['agent'],
    },
  ]

  const documentCenter = {
    signedDocuments: [
      {
        id: 'mandate-packet-version',
        name: 'Mandate final signed.pdf',
        document_type: 'mandate_signature',
        status: 'completed',
        file_path: 'seller-portal/listing/mandate.pdf',
      },
    ],
    uploadedDocuments: [
      {
        id: 'bond-upload',
        canonicalRequirementInstanceId: '22222222-2222-4222-8222-222222222222',
        document_type: 'bond_statement',
        status: 'uploaded',
        file_path: 'seller-portal/listing/bond.pdf',
      },
    ],
  }

  assert.equal(isCanonicalDocumentWorkspaceEnabled({ enabled: true }), true)
  assert.equal(isCanonicalDocumentWorkspaceEnabled({ enabled: false }), false)

  const model = buildCanonicalDocumentWorkspaceModel({ requirements, documentCenter, role: 'seller' })
  assert.equal(model.hasRequirements, true)
  assert.equal(model.requirements.length, 3, 'seller should not see internal-only requirements')
  assert.equal(model.packs.length, 3)

  const mandate = model.requirements.find((item) => item.documentDefinitionKey === 'signed_mandate')
  assert.equal(mandate.status, 'completed')
  assert.equal(getRequirementUploadState(mandate), 'generated')
  assert.equal(mandate.generatedDocument.id, 'mandate-packet-version')

  const bond = model.requirements.find((item) => item.documentDefinitionKey === 'bond_statement')
  assert.equal(bond.status, 'uploaded')
  assert.equal(getRequirementUploadState(bond), 'uploaded')
  assert.equal(bond.uploadedDocument.id, 'bond-upload')

  const rejected = model.requirements.find((item) => item.documentDefinitionKey === 'lease_agreement')
  assert.equal(rejected.status, 'rejected')
  assert.equal(model.rejected.length, 1)
  assert.equal(model.criticalMissing.some((item) => item.documentDefinitionKey === 'lease_agreement'), true)

  const mandateGate = model.readiness.gates.find((item) => item.gate === 'mandate_ready')
  assert.equal(mandateGate.ready, true)
  const attorneyGate = model.readiness.gates.find((item) => item.gate === 'attorney_instruction_ready')
  assert.equal(attorneyGate.ready, false)
  assert.equal(attorneyGate.blockingCount, 1)

  console.log('canonical-document-workspace tests passed')
} finally {
  await server.close()
}
