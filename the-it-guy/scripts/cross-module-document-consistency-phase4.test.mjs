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
    CROSS_MODULE_DOCUMENT_CONSISTENCY_VERSION,
    buildCrossModuleDocumentConsistencyAudit,
    getDefaultCrossModuleDocumentTouchpointRows,
    summarizeCrossModuleDocumentConsistencyAudit,
  } = await server.ssrLoadModule('/src/services/documents/crossModuleDocumentConsistencyService.js')

  const audit = buildCrossModuleDocumentConsistencyAudit({
    generatedAt: '2026-07-13T12:00:00.000Z',
  })

  assert.equal(audit.contractVersion, CROSS_MODULE_DOCUMENT_CONSISTENCY_VERSION)
  assert.equal(audit.status, 'healthy')
  assert.equal(audit.summary.criticalCount, 0)
  assert.equal(audit.summary.warningCount, 0)
  assert.equal(audit.summary.touchpointCount >= 8, true)
  assert.equal(audit.summary.parityGroupCount >= 10, true)
  assert.match(summarizeCrossModuleDocumentConsistencyAudit(audit), /document rows across/)

  const sellerProofGroup = audit.parityGroups.find((group) => group.parityGroup === 'seller_identity.proof_of_address')
  assert.equal(Boolean(sellerProofGroup), true)
  assert.deepEqual(sellerProofGroup.canonicalDocumentKeys, ['seller_proof_of_address'])
  assert.equal(sellerProofGroup.touchpointKeys.includes('seller_portal'), true)
  assert.equal(sellerProofGroup.touchpointKeys.includes('listing_documents'), true)
  assert.equal(sellerProofGroup.touchpointKeys.includes('seller_leads'), true)

  const buyerProofGroup = audit.parityGroups.find((group) => group.parityGroup === 'buyer_identity.proof_of_address')
  assert.equal(Boolean(buyerProofGroup), true)
  assert.deepEqual(buyerProofGroup.canonicalDocumentKeys, ['buyer_proof_of_address'])
  assert.equal(buyerProofGroup.touchpointKeys.includes('buyer_agency'), true)
  assert.equal(buyerProofGroup.touchpointKeys.includes('buyer_onboarding'), true)
  assert.equal(buyerProofGroup.touchpointKeys.includes('transaction_documents'), true)

  const attorneyTransferGroup = audit.parityGroups.find((group) => group.parityGroup === 'attorney_transfer.transfer_documents')
  assert.equal(Boolean(attorneyTransferGroup), true)
  assert.deepEqual(attorneyTransferGroup.canonicalDocumentKeys, ['transfer_documents'])
  assert.equal(attorneyTransferGroup.touchpointKeys.includes('attorney_transfer'), true)
  assert.equal(attorneyTransferGroup.touchpointKeys.includes('transaction_documents'), true)

  const bondInstructionGroup = audit.parityGroups.find((group) => group.parityGroup === 'bond_finance.instruction')
  assert.equal(Boolean(bondInstructionGroup), true)
  assert.deepEqual(bondInstructionGroup.canonicalDocumentKeys, ['bond_instruction_to_attorneys'])
  assert.equal(bondInstructionGroup.touchpointKeys.includes('bond_attorney'), true)
  assert.equal(bondInstructionGroup.touchpointKeys.includes('bond_originator'), true)

  const defaultRows = getDefaultCrossModuleDocumentTouchpointRows()
  const brokenAudit = buildCrossModuleDocumentConsistencyAudit({
    includeDefinitionCoverage: false,
    touchpoints: [
      ...defaultRows,
      {
        touchpointKey: 'buyer_agency',
        documentKey: 'proof_of_address',
        groupKey: 'buyer_fica',
        parityGroup: 'seller_identity.proof_of_address',
        expectedCanonicalDocumentKey: 'seller_proof_of_address',
      },
    ],
  })
  assert.equal(brokenAudit.status, 'blocked')
  assert.equal(
    brokenAudit.issues.some((issue) => issue.code === 'canonical_document_mismatch'),
    true,
    'Phase 4 audit should catch touchpoints resolving to the wrong canonical document.',
  )
  assert.equal(
    brokenAudit.issues.some((issue) => issue.code === 'parity_group_canonical_split'),
    true,
    'Phase 4 audit should catch parity groups split across canonical documents.',
  )

  const diagnosticsPage = readFileSync(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
  assert.match(diagnosticsPage, /Cross-module document consistency/)
  assert.match(diagnosticsPage, /buildCrossModuleDocumentConsistencyAudit/)

  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  assert.match(packageSource, /"test:cross-module-document-consistency": "node scripts\/cross-module-document-consistency-phase4\.test\.mjs"/)

  console.log('cross-module document consistency Phase 4 tests passed')
} finally {
  await server.close()
}
