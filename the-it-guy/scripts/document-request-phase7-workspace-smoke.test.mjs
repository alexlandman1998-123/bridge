import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION,
  buildDocumentRequestWorkspaceSmokeAudit,
  buildDocumentRequestWorkspaceSmokeFixture,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'
import {
  buildDocumentRequestContainerModel,
} from '../src/core/documents/documentRequestContainerModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const serviceSource = fs.readFileSync('src/services/documents/documentRequestWorkspaceSmokeService.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase7-workspace-smoke.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase7-workspace-smoke.md', 'utf8')
const clientPortalServiceSource = fs.readFileSync('src/services/clientPortalWorkspaceService.js', 'utf8')
const clientPortalPageSource = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')
const unitDetailSource = fs.readFileSync('src/pages/UnitDetail.jsx', 'utf8')
const attorneyTransactionSource = fs.readFileSync('src/pages/AttorneyTransactionDetail.jsx', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase7-workspace-smoke'],
  'node scripts/document-request-phase7-workspace-smoke.test.mjs',
  'package.json should expose the Phase 7 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase7-workspace-smoke'],
  'node scripts/document-request-phase7-workspace-smoke.mjs',
  'package.json should expose the Phase 7 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase7-workspace-smoke'],
  'npm run verify:document-request-phase6-professional-propagation && npm run test:document-request-phase7-workspace-smoke && npm run report:document-request-phase7-workspace-smoke',
  'package.json should expose the Phase 7 verification command.',
)

assert.match(serviceSource, /document_request_workspace_smoke_v2/, 'Phase 7 service should carry the complete audience-matrix version.')
assert.match(serviceSource, /buyer_portal_smoke/, 'Phase 7 should smoke buyer portal containers.')
assert.match(serviceSource, /seller_portal_smoke/, 'Phase 7 should smoke seller portal containers.')
assert.match(serviceSource, /bond_originator_workspace_smoke/, 'Phase 7 should smoke bond-originator containers.')
assert.match(scriptSource, /document_request_phase7_workspace_smoke/, 'Phase 7 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 7 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 7 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 7 report should not query or mutate database tables.')
assert.match(docs, /Workspace Smoke QA/, 'Phase 7 docs should name the phase.')
assert.match(docs, /same container/, 'Phase 7 docs should describe same-container propagation.')

assert.match(clientPortalServiceSource, /documentRequestContainers/, 'Document centre service should return request containers.')
assert.match(clientPortalServiceSource, /documentRequestContainerSummary/, 'Document centre service should return request container summaries.')
assert.match(clientPortalPageSource, /additionalDocumentRequestsForWorkspace/, 'Client portal should consume additional document requests.')
assert.match(clientPortalPageSource, /onUploadRequestDocument/, 'Client portal should expose upload handling for request documents.')
assert.match(unitDetailSource, /createTransactionDocumentRequests/, 'Agent/unit workspace should create document requests.')
assert.match(attorneyTransactionSource, /createTransactionDocumentRequests/, 'Attorney workspace should create document requests.')
assert.match(attorneyTransactionSource, /buildAttorneyDocumentControl/, 'Attorney workspace should pass requests into document control.')
assert.match(attorneyTransactionSource, /additionalRequests:\s*additionalDocumentRequests/, 'Attorney workspace should include additional requests in document control.')

const audit = buildDocumentRequestWorkspaceSmokeAudit()
assert.equal(audit.version, DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION)
assert.equal(audit.summary.failedSmokeCount, 0)
assert.equal(audit.summary.coveredAudienceCount, 8)
assert.equal(audit.summary.missingAudienceSmokeCount, 0)
assert.equal(audit.summary.unstableContainerIdCount, 0)
assert.equal(audit.summary.deferredSellerUploadLeakCount, 0)
assert.ok(audit.summary.buyerContainerCount > 0)
assert.ok(audit.summary.sellerContainerCount > 0)
assert.ok(audit.summary.agentContainerCount > audit.summary.buyerContainerCount)
assert.ok(audit.summary.attorneyContainerCount >= audit.summary.agentContainerCount)
assert.ok(audit.summary.bondOriginatorContainerCount > 0)
assert.ok(audit.summary.transferAttorneyContainerCount > 0)
assert.ok(audit.summary.cancellationAttorneyContainerCount > 0)
assert.ok(audit.summary.internalContainerCount >= audit.summary.agentContainerCount)
assert.equal(audit.results.length, 8)

for (const result of audit.results) {
  assert.equal(result.ok, true, `${result.id} should pass.`)
  assert.equal(result.deferredSellerUploadLeak, false, `${result.id} should not leak deferred seller uploads.`)
}
for (const item of audit.crossAudienceContainerIds) {
  assert.equal(item.stable, true, `${item.requestId} should keep one container id across audiences.`)
  assert.equal(item.containerIds.length, 1)
}

const buyerSmoke = audit.results.find((result) => result.id === 'buyer_portal_smoke')
assert.ok(buyerSmoke.keys.includes('buyer_trust_deed'))
assert.ok(buyerSmoke.keys.includes('income_affordability_documents'))
assert.ok(buyerSmoke.requestIds.includes('phase6-originator-buyer-request'))
assert.equal(buyerSmoke.requestIds.includes('phase6-cancellation-seller-request'), false)

const sellerSmoke = audit.results.find((result) => result.id === 'seller_portal_smoke')
assert.ok(sellerSmoke.keys.includes('seller_company_registration'))
assert.ok(sellerSmoke.keys.includes('bond_statement'))
assert.ok(sellerSmoke.requestIds.includes('phase6-cancellation-seller-request'))
assert.equal(sellerSmoke.requestIds.includes('phase6-originator-buyer-request'), false)

const originatorSmoke = audit.results.find((result) => result.id === 'bond_originator_workspace_smoke')
assert.ok(originatorSmoke.keys.includes('bond_approval'))
assert.ok(originatorSmoke.requestIds.includes('phase6-originator-professional-request'))
assert.equal(originatorSmoke.requestIds.includes('phase6-cancellation-seller-request'), false)

const transferAttorneySmoke = audit.results.find((result) => result.id === 'transfer_attorney_lane_smoke')
assert.ok(transferAttorneySmoke.requestIds.includes('phase6-transfer-buyer-request'))
assert.ok(transferAttorneySmoke.requestIds.includes('phase6-professional-buyer-boundary-request'))
assert.equal(transferAttorneySmoke.requestIds.includes('phase6-cancellation-seller-request'), false)

const cancellationAttorneySmoke = audit.results.find((result) => result.id === 'cancellation_attorney_lane_smoke')
assert.deepEqual(cancellationAttorneySmoke.requestIds, ['phase6-cancellation-seller-request'])

const fixture = buildDocumentRequestWorkspaceSmokeFixture()
const buyerModel = buildDocumentRequestContainerModel({
  transactionId: fixture.transactionId,
  requiredDocuments: fixture.requiredDocuments,
  additionalRequests: fixture.additionalRequests,
  audience: 'buyer',
})
const agentModel = buildDocumentRequestContainerModel({
  transactionId: fixture.transactionId,
  requiredDocuments: fixture.requiredDocuments,
  additionalRequests: fixture.additionalRequests,
  audience: 'agent',
})
const requestId = 'phase6-transfer-buyer-request'
assert.equal(
  buyerModel.containers.find((container) => container.sourceId === requestId)?.id,
  agentModel.containers.find((container) => container.sourceId === requestId)?.id,
  'Buyer and agent should see the same additional-request container id.',
)

const bundleDir = await mkdtemp(path.join(tmpdir(), 'document-request-phase7-workspace-smoke-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

await writeFile(
  entryPath,
  `export { buildDocumentCenter } from ${JSON.stringify(servicePath)}\n`,
)

await build({
  entryPoints: [entryPath],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  define: {
    'import.meta.env': '{}',
  },
  logLevel: 'silent',
})

const { buildDocumentCenter } = await import(pathToFileURL(bundlePath).href)
const portalModel = buildDocumentCenter({
  transaction: {
    id: fixture.transactionId,
    purchaser_type: 'trust',
    finance_type: 'hybrid',
  },
  canonicalDocumentRequestScenario: fixture.scenario,
  requiredDocuments: fixture.requiredDocuments,
  additionalDocumentRequests: fixture.additionalRequests,
  documents: [],
}, 'buying')
assert.ok(portalModel.documentRequestContainers.length > 0)
assert.ok(portalModel.documentRequestContainerSummary.additionalRequests >= 3)
assert.ok(portalModel.documentRequestContainers.some((container) => container.sourceId === 'phase6-originator-buyer-request'))
assert.equal(
  portalModel.documentRequestContainers.some((container) => container.sourceId === 'phase6-professional-buyer-boundary-request'),
  false,
)
assert.equal(
  portalModel.documentRequestContainers.some((container) => container.sourceId === 'phase6-cancellation-seller-request'),
  false,
)

const outputPath = 'output/document-request-phase7-workspace-smoke.test.json'
execFileSync('node', ['scripts/document-request-phase7-workspace-smoke.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase7_workspace_smoke')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'workspace_smoke_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.summary.failedSmokeCount, 0)
assert.equal(report.summary.coveredAudienceCount, 8)
assert.equal(report.summary.missingAudienceSmokeCount, 0)
assert.equal(report.summary.unstableContainerIdCount, 0)
assert.equal(report.summary.deferredSellerUploadLeakCount, 0)

console.log('document request phase 7 workspace smoke tests passed')
