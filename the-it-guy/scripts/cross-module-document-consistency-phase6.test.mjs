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
    CROSS_MODULE_DOCUMENT_CONSISTENCY_GATE_VERSION,
    buildCrossModuleDocumentConsistencyActionQueues,
    buildCrossModuleDocumentConsistencyAudit,
    buildCrossModuleDocumentConsistencyGate,
    getDefaultCrossModuleDocumentTouchpointRows,
    renderCrossModuleDocumentConsistencyGateMarkdown,
  } = await server.ssrLoadModule('/src/services/documents/crossModuleDocumentConsistencyService.js')

  const cleanAudit = buildCrossModuleDocumentConsistencyAudit({
    generatedAt: '2026-07-13T12:00:00.000Z',
  })
  const cleanGate = buildCrossModuleDocumentConsistencyGate(cleanAudit)
  assert.equal(cleanGate.contractVersion, CROSS_MODULE_DOCUMENT_CONSISTENCY_GATE_VERSION)
  assert.equal(cleanGate.phase, '6')
  assert.equal(cleanGate.status, 'pass')
  assert.equal(cleanGate.exitCode, 0)
  assert.equal(cleanGate.releaseReady, true)
  assert.equal(cleanGate.dryRun, true)
  assert.equal(cleanGate.mutatedData, false)
  assert.equal(cleanGate.summary.rowCount, cleanAudit.summary.rowCount)

  const brokenAudit = buildCrossModuleDocumentConsistencyAudit({
    includeDefinitionCoverage: false,
    generatedAt: '2026-07-13T12:00:00.000Z',
    touchpoints: [
      ...getDefaultCrossModuleDocumentTouchpointRows(),
      {
        touchpointKey: 'buyer_agency',
        documentKey: 'proof_of_address',
        groupKey: 'buyer_fica',
        parityGroup: 'seller_identity.proof_of_address',
        expectedCanonicalDocumentKey: 'seller_proof_of_address',
      },
    ],
  })
  const brokenQueues = buildCrossModuleDocumentConsistencyActionQueues(brokenAudit)
  const brokenGate = buildCrossModuleDocumentConsistencyGate(brokenAudit)
  assert.equal(brokenGate.status, 'fail')
  assert.equal(brokenGate.exitCode, 1)
  assert.equal(brokenGate.releaseReady, false)
  assert.ok(brokenGate.blockers.some((blocker) => blocker.includes('critical cross-module document consistency')))
  assert.equal(
    brokenQueues.canonicalMismatches.some((issue) => issue.code === 'canonical_document_mismatch'),
    true,
    'Phase 6 gate should queue buyer/seller canonical mismatches for repair.',
  )

  const partialAudit = {
    contractVersion: cleanAudit.contractVersion,
    crossModuleDocumentMapVersion: cleanAudit.crossModuleDocumentMapVersion,
    generatedAt: '2026-07-13T12:00:00.000Z',
    source: 'live_workspace',
    status: 'healthy',
    summary: {
      status: 'healthy',
      rowCount: 0,
      touchpointCount: 0,
      parityGroupCount: 0,
      criticalCount: 0,
      warningCount: 0,
      queryWarningCount: 1,
    },
    issues: [],
    queryWarnings: [{ table: 'documents', code: 'PGRST204', message: 'schema cache miss' }],
  }
  const warningGate = buildCrossModuleDocumentConsistencyGate(partialAudit)
  assert.equal(warningGate.status, 'warning')
  assert.equal(warningGate.exitCode, 0)
  assert.equal(warningGate.releaseReady, true)
  assert.ok(warningGate.warnings.some((warning) => warning.includes('partial data')))
  assert.ok(warningGate.warnings.some((warning) => warning.includes('No cross-module document rows')))

  const strictGate = buildCrossModuleDocumentConsistencyGate(partialAudit, {
    failOnQueryWarning: true,
    failOnEmpty: true,
  })
  assert.equal(strictGate.status, 'fail')
  assert.equal(strictGate.exitCode, 1)
  assert.equal(strictGate.releaseReady, false)
  assert.ok(strictGate.blockers.some((blocker) => blocker.includes('partial data')))
  assert.ok(strictGate.blockers.some((blocker) => blocker.includes('No cross-module document rows')))

  const markdown = renderCrossModuleDocumentConsistencyGateMarkdown({
    audit: brokenAudit,
    gate: brokenGate,
    options: { organisationId: 'workspace-1' },
  })
  assert.match(markdown, /# Cross-Module Document Consistency Gate/)
  assert.match(markdown, /Release ready: no/)
  assert.match(markdown, /Mutated data: no/)
  assert.match(markdown, /npm run verify:cross-module-documents -- --organisation-id=workspace-1/)
  assert.match(markdown, /This gate is read-only/)

  const cliSource = readFileSync(new URL('./verify-cross-module-documents.mjs', import.meta.url), 'utf8')
  assert.match(cliSource, /--static-contract/)
  assert.match(cliSource, /fetchCrossModuleDocumentConsistencySnapshot/)
  assert.match(cliSource, /buildCrossModuleDocumentConsistencyGate/)
  assert.match(cliSource, /renderCrossModuleDocumentConsistencyGateMarkdown/)
  assert.match(cliSource, /process\.exitCode = gate\.exitCode/)

  const diagnosticsPage = readFileSync(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
  assert.match(diagnosticsPage, /buildCrossModuleDocumentConsistencyGate/)
  assert.match(diagnosticsPage, /documentConsistencyGate/)
  assert.match(diagnosticsPage, /Phase 6 gate/)

  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  assert.match(packageSource, /"test:cross-module-document-consistency-phase6": "node scripts\/cross-module-document-consistency-phase6\.test\.mjs"/)
  assert.match(packageSource, /"verify:cross-module-documents": "node scripts\/verify-cross-module-documents\.mjs"/)

  console.log('cross-module document consistency Phase 6 gate tests passed')
} finally {
  await server.close()
}
