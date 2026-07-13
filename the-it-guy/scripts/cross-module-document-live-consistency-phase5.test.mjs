import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildCrossModuleDocumentConsistencyAudit,
    buildCrossModuleDocumentLiveTouchpointRows,
  } = await server.ssrLoadModule('/src/services/documents/crossModuleDocumentConsistencyService.js')

  const documentRequirementInstances = [
    {
      id: 'inst-seller-address',
      document_definition_key: 'seller_proof_of_address',
      context_type: 'private_listing',
      context_id: 'listing-1',
      listing_id: 'listing-1',
      pack_key: 'seller_identity_fica',
      requested_from_role: 'seller',
      visible_to_roles: ['seller', 'agent'],
      uploadable_by_roles: ['seller'],
    },
    {
      id: 'inst-bond-instruction',
      document_definition_key: 'bond_instruction_to_attorneys',
      context_type: 'transaction',
      context_id: 'tx-1',
      transaction_id: 'tx-1',
      pack_key: 'bond_originator',
      requested_from_role: 'bond_originator',
      visible_to_roles: ['bond_originator', 'bond_attorney'],
      uploadable_by_roles: ['bond_originator'],
    },
  ]

  const cleanLiveRows = buildCrossModuleDocumentLiveTouchpointRows({
    privateListingRequirements: [
      {
        id: 'seller-address-row',
        private_listing_id: 'listing-1',
        requirement_key: 'proof_of_address',
        requirement_name: 'Proof of Address',
        requirement_group: 'seller_identity_fica',
        document_visibility: 'seller_visible',
        canonical_requirement_instance_id: 'inst-seller-address',
      },
    ],
    transactionDocumentRequirements: [
      {
        id: 'bond-instruction-row',
        transaction_id: 'tx-1',
        document_key: 'bond_instruction',
        document_name: 'Bond Instruction',
        requested_from: 'bond_originator',
        responsible_role: 'bond_originator',
        visible_section: 'bond_registration_documents',
        canonical_requirement_instance_id: 'inst-bond-instruction',
      },
    ],
    documentRequirementInstances,
  })

  assert.equal(cleanLiveRows.sourceCounts.privateListingRequirements, 1)
  assert.equal(cleanLiveRows.sourceCounts.transactionDocumentRequirements, 1)
  assert.equal(cleanLiveRows.sourceCounts.documentRequirementInstances, 2)
  assert.equal(cleanLiveRows.rows.some((row) => row.touchpointKey === 'seller_portal'), true)
  assert.equal(cleanLiveRows.rows.some((row) => row.touchpointKey === 'listing_documents'), true)
  assert.equal(cleanLiveRows.rows.some((row) => row.touchpointKey === 'bond_originator'), true)

  const cleanAudit = buildCrossModuleDocumentConsistencyAudit({
    includeDefinitionCoverage: false,
    touchpoints: cleanLiveRows.touchpoints,
    generatedAt: '2026-07-13T12:00:00.000Z',
  })
  assert.equal(cleanAudit.status, 'healthy')
  assert.equal(cleanAudit.summary.criticalCount, 0)
  assert.equal(
    cleanAudit.parityGroups.some((group) => group.parityGroup === 'requirement_instance.inst_seller_address'),
    true,
  )

  const brokenLiveRows = buildCrossModuleDocumentLiveTouchpointRows({
    transactionDocumentRequirements: [
      {
        id: 'buyer-row-linked-to-seller-instance',
        transaction_id: 'tx-1',
        document_key: 'proof_of_address',
        document_name: 'Proof of Address',
        requested_from: 'buyer',
        responsible_role: 'buyer',
        visible_section: 'buyer_documents',
        canonical_requirement_instance_id: 'inst-seller-address',
      },
    ],
    documentRequirementInstances,
  })
  const brokenAudit = buildCrossModuleDocumentConsistencyAudit({
    includeDefinitionCoverage: false,
    touchpoints: brokenLiveRows.touchpoints,
  })
  assert.equal(brokenAudit.status, 'blocked')
  assert.equal(
    brokenAudit.issues.some((issue) => issue.code === 'canonical_document_mismatch'),
    true,
    'Live Phase 5 audit should catch legacy rows linked to the wrong canonical requirement instance.',
  )
  assert.equal(
    brokenAudit.issues.some((issue) => issue.code === 'parity_group_canonical_split'),
    true,
    'Live Phase 5 audit should catch a requirement instance split across canonical keys.',
  )

  const diagnosticsPage = readFileSync(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
  assert.match(diagnosticsPage, /fetchCrossModuleDocumentConsistencySnapshot/)
  assert.match(diagnosticsPage, /Run live workspace/)

  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  assert.match(packageSource, /"test:cross-module-document-live-consistency": "node scripts\/cross-module-document-live-consistency-phase5\.test\.mjs"/)

  console.log('cross-module document live consistency Phase 5 tests passed')
} finally {
  await server.close()
}
