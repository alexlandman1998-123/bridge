import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  buildDocumentRequestWorkspaceSmokeFixture,
} from '../src/services/documents/documentRequestWorkspaceSmokeService.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const clientPortalSource = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')
const serviceSource = fs.readFileSync('src/services/clientPortalWorkspaceService.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase8-client-portal-container-adoption.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase8-client-portal-container-adoption.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase8-client-portal-container-adoption'],
  'node scripts/document-request-phase8-client-portal-container-adoption.test.mjs',
  'package.json should expose the Phase 8 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase8-client-portal-container-adoption'],
  'node scripts/document-request-phase8-client-portal-container-adoption.mjs',
  'package.json should expose the Phase 8 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase8-client-portal-container-adoption'],
  'npm run verify:document-request-phase7-workspace-smoke && npm run test:document-request-phase8-client-portal-container-adoption && npm run report:document-request-phase8-client-portal-container-adoption',
  'package.json should expose the Phase 8 verification command.',
)

assert.match(scriptSource, /document_request_phase8_client_portal_container_adoption/, 'Phase 8 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 8 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 8 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 8 report should not query or mutate database tables.')
assert.match(docs, /Client Portal Container Adoption/, 'Phase 8 docs should name the phase.')
assert.match(docs, /documentRequestContainers/, 'Phase 8 docs should mention the adopted container payload.')

assert.match(serviceSource, /documentRequestContainers/, 'Document centre service should expose containers.')
assert.match(serviceSource, /documentRequestContainerSummary/, 'Document centre service should expose container summary.')
assert.match(clientPortalSource, /workspaceData\?\.documentCenter\?\.documentRequestContainers/, 'Client portal should read document centre containers.')
assert.match(clientPortalSource, /additionalDocumentRequestContainersForWorkspace/, 'Client portal should derive additional request containers.')
assert.match(clientPortalSource, /additionalDocumentRequestCardsForWorkspace/, 'Client portal should render unified additional request cards.')
assert.match(clientPortalSource, /source:\s*'container'/, 'Container-backed cards should be marked.')
assert.match(clientPortalSource, /source:\s*'legacy_request'/, 'Legacy fallback should be retained.')
assert.match(clientPortalSource, /additionalDocumentRequestCardsForWorkspace\.map/, 'Additional tab should map unified cards.')
assert.doesNotMatch(clientPortalSource, /\{additionalDocumentRequestsForWorkspace\.map\(\(request\) =>/, 'Additional tab should not render raw request rows directly.')
assert.match(clientPortalSource, /request\.uploadSpec\?\.requestId/, 'Container upload should use uploadSpec request id.')
assert.match(clientPortalSource, /documentRequestId,/, 'Container upload should pass documentRequestId.')

const fixture = buildDocumentRequestWorkspaceSmokeFixture()
const bundleDir = await mkdtemp(path.join(tmpdir(), 'document-request-phase8-container-adoption-'))
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
const buyingCenter = buildDocumentCenter({
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
const sellingCenter = buildDocumentCenter({
  transaction: {
    id: fixture.transactionId,
    purchaser_type: 'trust',
    finance_type: 'hybrid',
  },
  canonicalDocumentRequestScenario: fixture.scenario,
  requiredDocuments: fixture.requiredDocuments,
  additionalDocumentRequests: fixture.additionalRequests,
  documents: [],
}, 'selling')

assert.ok(buyingCenter.documentRequestContainers.some((container) => container.sourceId === 'phase6-originator-buyer-request'))
assert.equal(
  buyingCenter.documentRequestContainers.some((container) => container.sourceId === 'phase6-cancellation-seller-request'),
  false,
)
assert.ok(sellingCenter.documentRequestContainers.some((container) => container.sourceId === 'phase6-cancellation-seller-request'))
assert.equal(
  sellingCenter.documentRequestContainers.some((container) => container.sourceId === 'phase6-originator-buyer-request'),
  false,
)
assert.equal(buyingCenter.documentRequestContainerSummary.additionalRequests, 3)
assert.equal(sellingCenter.documentRequestContainerSummary.additionalRequests, 2)

const outputPath = 'output/document-request-phase8-client-portal-container-adoption.test.json'
execFileSync('node', ['scripts/document-request-phase8-client-portal-container-adoption.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase8_client_portal_container_adoption')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'client_portal_container_adoption_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)

console.log('document request phase 8 client portal container adoption tests passed')
