import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  buildDocumentRequestContainerModel,
  resolveDefaultDocumentRequestVisibility,
} from '../src/core/documents/documentRequestContainerModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const apiSource = fs.readFileSync('src/lib/api.js', 'utf8')
const portalSource = fs.readFileSync('src/services/clientPortalWorkspaceService.js', 'utf8')
const modelSource = fs.readFileSync('src/core/documents/documentRequestContainerModel.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase2-containers.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase2-containers.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase2-containers'],
  'node scripts/document-request-phase2-containers.test.mjs',
  'package.json should expose the Phase 2 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase2-containers'],
  'node scripts/document-request-phase2-containers.mjs',
  'package.json should expose the Phase 2 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase2-containers'],
  'npm run verify:document-request-phase1-single-canonical-policy && npm run test:document-request-phase2-containers && npm run report:document-request-phase2-containers',
  'package.json should expose the Phase 2 verification command.',
)

assert.match(modelSource, /document_request_container_model_v1/, 'Container model should have a stable version.')
assert.match(modelSource, /normalizeRequiredDocumentContainer/, 'Container model should normalize canonical required rows.')
assert.match(modelSource, /normalizeAdditionalDocumentRequestContainer/, 'Container model should normalize ad hoc request rows.')
assert.match(modelSource, /resolveDefaultDocumentRequestVisibility/, 'Container model should own default visibility.')
assert.match(apiSource, /resolveDefaultDocumentRequestVisibility/, 'Shared request API should use container-model visibility defaults.')
assert.match(apiSource, /document_request_groups/, 'Shared request API should still create request groups.')
assert.match(apiSource, /updateDocumentRequestFromUploadIfPossible/, 'Upload path should still link uploads back to document requests.')
assert.match(portalSource, /buildDocumentRequestContainerModel/, 'Portal document centre should expose request containers.')
assert.match(portalSource, /documentRequestContainers/, 'Portal document centre should return request containers.')
assert.match(scriptSource, /document_request_phase2_containers/, 'Phase 2 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 2 report should state no data mutation.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 2 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 2 report should not query or mutate database tables.')
assert.match(docs, /Document Request Containers/, 'Phase 2 docs should name the phase.')
assert.match(docs, /buyer, seller, agent, attorney, and bond-originator/i, 'Phase 2 docs should cover all workspaces.')

assert.equal(resolveDefaultDocumentRequestVisibility('buyer'), 'client_visible')
assert.equal(resolveDefaultDocumentRequestVisibility('seller'), 'client_visible')
assert.equal(resolveDefaultDocumentRequestVisibility('buyer_and_seller'), 'client_visible')
assert.equal(resolveDefaultDocumentRequestVisibility('bond_originator'), 'shared_role_players')
assert.equal(resolveDefaultDocumentRequestVisibility('buyer', 'internal_only'), 'internal_only')

const model = buildDocumentRequestContainerModel({
  transactionId: 'phase2-test',
  audience: 'internal',
  requiredDocuments: [
    {
      id: 'buyer-fica',
      document_key: 'buyer_fica_pack',
      document_label: 'Buyer FICA Pack',
      requested_from: 'buyer',
      visibility_scope: 'client_visible',
      status: 'missing',
    },
    {
      id: 'seller-fica',
      document_key: 'seller_fica_pack',
      document_label: 'Seller FICA Pack',
      requested_from: 'seller',
      visibility_scope: 'client_visible',
      status: 'uploaded',
      uploaded_document_id: 'doc-seller-fica',
    },
  ],
  additionalRequests: [
    {
      id: 'attorney-buyer-request',
      title: 'Updated buyer bank statement',
      requested_from: 'buyer',
      created_by_role: 'attorney',
      status: 'requested',
      priority: 'required',
    },
    {
      id: 'bond-buyer-request',
      title: 'Latest payslip',
      requested_from: 'buyer',
      created_by_role: 'bond_originator',
      status: 'requested',
      priority: 'required',
    },
    {
      id: 'agent-seller-request',
      title: 'Latest levy statement',
      requested_from: 'seller',
      created_by_role: 'agent',
      status: 'requested',
      priority: 'required',
    },
  ],
})

assert.equal(model.summary.total, 5)
assert.equal(model.summary.canonicalRequired, 2)
assert.equal(model.summary.additionalRequests, 3)
assert.equal(model.summary.blocking, 4)
assert.equal(model.summary.uploaded, 1)
assert.ok(model.containers.every((container) => container.uploadSpec || container.hasUploadedDocument))

const buyerModel = buildDocumentRequestContainerModel({
  transactionId: 'phase2-test',
  audience: 'buyer',
  requiredDocuments: model.allContainers.filter((container) => container.source === 'transaction_required_documents'),
  additionalRequests: model.allContainers.filter((container) => container.source === 'document_requests'),
})
assert.ok(buyerModel.containers.some((container) => container.sourceId === 'attorney-buyer-request'))
assert.ok(buyerModel.containers.some((container) => container.sourceId === 'bond-buyer-request'))
assert.equal(buyerModel.containers.some((container) => container.sourceId === 'agent-seller-request'), false)

const sellerModel = buildDocumentRequestContainerModel({
  transactionId: 'phase2-test',
  audience: 'seller',
  requiredDocuments: model.allContainers.filter((container) => container.source === 'transaction_required_documents'),
  additionalRequests: model.allContainers.filter((container) => container.source === 'document_requests'),
})
assert.ok(sellerModel.containers.some((container) => container.sourceId === 'agent-seller-request'))
assert.equal(sellerModel.containers.some((container) => container.sourceId === 'bond-buyer-request'), false)

const outputPath = 'output/document-request-phase2-containers.test.json'
execFileSync('node', ['scripts/document-request-phase2-containers.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase2_containers')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'containers_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.defaultVisibilityProof.buyer, 'client_visible')
assert.equal(report.defaultVisibilityProof.seller, 'client_visible')
assert.equal(report.defaultVisibilityProof.bondOriginator, 'shared_role_players')
assert.equal(report.audienceProofs.buyer.summary.additionalRequests, 2)
assert.equal(report.audienceProofs.seller.summary.additionalRequests, 1)

console.log('document request phase 2 container tests passed')
