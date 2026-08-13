import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION,
  buildDocumentRequestProfessionalPropagationAudit,
  buildProfessionalDocumentRequestUploadTransition,
} from '../src/services/documents/documentRequestProfessionalPropagationService.js'
import {
  buildDocumentRequestContainerModel,
  resolveDefaultDocumentRequestVisibility,
} from '../src/core/documents/documentRequestContainerModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const serviceSource = fs.readFileSync('src/services/documents/documentRequestProfessionalPropagationService.js', 'utf8')
const apiSource = fs.readFileSync('src/lib/api.js', 'utf8')
const laneSource = fs.readFileSync('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase6-professional-propagation.md', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase6-professional-propagation.mjs', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase6-professional-propagation'],
  'node scripts/document-request-phase6-professional-propagation.test.mjs',
  'package.json should expose the Phase 6 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase6-professional-propagation'],
  'node scripts/document-request-phase6-professional-propagation.mjs',
  'package.json should expose the Phase 6 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase6-professional-propagation'],
  'npm run verify:document-request-phase5-seller-cleanup && npm run test:document-request-phase6-professional-propagation && npm run report:document-request-phase6-professional-propagation',
  'package.json should expose the Phase 6 verification command.',
)

assert.match(serviceSource, /document_request_professional_propagation_v1/, 'Phase 6 service should carry a stable version.')
assert.match(serviceSource, /bond_originator_requests_buyer_affordability/, 'Phase 6 should cover bond-originator requests to the buyer.')
assert.match(serviceSource, /cancellation_attorney_requests_seller_bond_statement/, 'Phase 6 should cover attorney requests to the seller.')
assert.match(scriptSource, /document_request_phase6_professional_propagation/, 'Phase 6 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 6 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 6 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 6 report should not query or mutate database tables.')
assert.match(docs, /Professional Request Propagation/, 'Phase 6 docs should name the phase.')
assert.match(docs, /bond originator/, 'Phase 6 docs should mention bond originator propagation.')

assert.match(apiSource, /resolveDefaultDocumentRequestVisibility\(\s*requestedFrom,\s*request\.visibility \|\| request\.visibility_scope/s)
assert.match(apiSource, /created_by_role:\s*normalizedActorRole/, 'General create API should persist the requester role.')
assert.match(apiSource, /requested_from:\s*requestedFrom/, 'General create API should persist requested_from.')
assert.match(apiSource, /visibility_scope:/, 'General create API should persist visibility_scope.')
assert.match(apiSource, /fetchClientVisibleAdditionalDocumentRequests/, 'Client portal should load client-visible additional requests.')
assert.match(laneSource, /created_by_role:\s*'attorney'/, 'Attorney lane requests should identify the requester role.')
assert.match(laneSource, /requested_from:\s*requestAudience/, 'Attorney lane requests should persist requested_from.')
assert.match(laneSource, /visibility_scope:\s*requestVisibility/, 'Attorney lane requests should persist visibility_scope.')
assert.doesNotMatch(laneSource, /delete fallback\.requested_from/, 'Attorney lane fallback must not strip requested_from.')

assert.equal(resolveDefaultDocumentRequestVisibility('buyer'), 'client_visible')
assert.equal(resolveDefaultDocumentRequestVisibility('seller'), 'client_visible')
assert.equal(resolveDefaultDocumentRequestVisibility('buyer_and_seller'), 'client_visible')
assert.equal(resolveDefaultDocumentRequestVisibility('bond_originator'), 'shared_role_players')

const audit = buildDocumentRequestProfessionalPropagationAudit()
assert.equal(audit.version, DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION)
assert.equal(audit.scenarioCount, 5)
assert.equal(audit.summary.missingAudienceCount, 0)
assert.equal(audit.summary.leakedAudienceCount, 0)
assert.equal(audit.summary.uploadTransitionOk, true)
assert.ok(audit.summary.buyerVisibleRequestCount >= 2)
assert.ok(audit.summary.sellerVisibleRequestCount >= 1)
assert.ok(audit.summary.bondOriginatorVisibleRequestCount >= 2)

const transferBuyer = audit.results.find((result) => result.id === 'transfer_attorney_requests_buyer_fica')
assert.ok(transferBuyer.visibleAudiences.includes('buyer'))
assert.ok(transferBuyer.visibleAudiences.includes('agent'))
assert.ok(transferBuyer.visibleAudiences.includes('attorney'))
assert.ok(transferBuyer.visibleAudiences.includes('transfer_attorney'))
assert.equal(transferBuyer.visibleAudiences.includes('seller'), false)

const cancellationSeller = audit.results.find((result) => result.id === 'cancellation_attorney_requests_seller_bond_statement')
assert.ok(cancellationSeller.visibleAudiences.includes('seller'))
assert.ok(cancellationSeller.visibleAudiences.includes('cancellation_attorney'))
assert.equal(cancellationSeller.visibleAudiences.includes('buyer'), false)

const originatorBuyer = audit.results.find((result) => result.id === 'bond_originator_requests_buyer_affordability')
assert.ok(originatorBuyer.visibleAudiences.includes('buyer'))
assert.ok(originatorBuyer.visibleAudiences.includes('bond_originator'))
assert.equal(originatorBuyer.visibleAudiences.includes('seller'), false)

const professionalOnly = audit.results.find((result) => result.id === 'bond_originator_internal_follow_up')
assert.ok(professionalOnly.visibleAudiences.includes('bond_originator'))
assert.ok(professionalOnly.visibleAudiences.includes('agent'))
assert.equal(professionalOnly.visibleAudiences.includes('buyer'), false)
assert.equal(professionalOnly.visibleAudiences.includes('seller'), false)

const uploadTransition = buildProfessionalDocumentRequestUploadTransition()
assert.equal(uploadTransition.before.status, 'requested')
assert.equal(uploadTransition.before.blocksReadiness, true)
assert.equal(uploadTransition.before.hasUploadedDocument, false)
assert.equal(uploadTransition.after.status, 'uploaded')
assert.equal(uploadTransition.after.blocksReadiness, false)
assert.equal(uploadTransition.after.hasUploadedDocument, true)
assert.equal(uploadTransition.after.linkedDocumentId, 'phase6-uploaded-document')

const sameRequest = {
  id: 'phase6-same-container',
  transaction_id: 'phase6-same-transaction',
  title: 'Same Request',
  document_type: 'same_request',
  requested_from: 'buyer',
  assigned_to_role: 'buyer',
  visibility_scope: 'client_visible',
  created_by_role: 'bond_originator',
  status: 'requested',
}
const buyerModel = buildDocumentRequestContainerModel({
  transactionId: 'phase6-same-transaction',
  additionalRequests: [sameRequest],
  audience: 'buyer',
})
const agentModel = buildDocumentRequestContainerModel({
  transactionId: 'phase6-same-transaction',
  additionalRequests: [sameRequest],
  audience: 'agent',
})
const originatorModel = buildDocumentRequestContainerModel({
  transactionId: 'phase6-same-transaction',
  additionalRequests: [sameRequest],
  audience: 'bond_originator',
})
assert.equal(buyerModel.containers[0].id, agentModel.containers[0].id)
assert.equal(agentModel.containers[0].id, originatorModel.containers[0].id)

const outputPath = 'output/document-request-phase6-professional-propagation.test.json'
execFileSync('node', ['scripts/document-request-phase6-professional-propagation.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase6_professional_propagation')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'professional_request_propagation_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.summary.missingAudienceCount, 0)
assert.equal(report.summary.leakedAudienceCount, 0)

console.log('document request phase 6 professional propagation tests passed')
