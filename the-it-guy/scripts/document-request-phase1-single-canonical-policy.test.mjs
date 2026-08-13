import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { buildCanonicalDocumentRequestPlan } from '../src/core/documents/documentRequestCanonicalPlanner.js'
import {
  buildCanonicalDocumentRequestPolicyReport,
  CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS,
  DOCUMENT_REQUEST_CANONICAL_POLICY_SOURCE,
  DOCUMENT_REQUEST_CANONICAL_POLICY_VERSION,
  validateCanonicalDocumentRequestPolicy,
} from '../src/core/documents/documentRequestCanonicalPolicy.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const matrixSource = fs.readFileSync('src/core/documents/documentRequestCanonicalMatrix.js', 'utf8')
const policySource = fs.readFileSync('src/core/documents/documentRequestCanonicalPolicy.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase1-single-canonical-policy.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase1-single-canonical-policy.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase1-single-canonical-policy'],
  'node scripts/document-request-phase1-single-canonical-policy.test.mjs',
  'package.json should expose the Phase 1 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase1-single-canonical-policy'],
  'node scripts/document-request-phase1-single-canonical-policy.mjs',
  'package.json should expose the Phase 1 policy report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase1-single-canonical-policy'],
  'npm run verify:document-request-phase0-freeze-and-map && npm run test:document-request-phase1-single-canonical-policy && npm run report:document-request-phase1-single-canonical-policy',
  'package.json should expose the Phase 1 verification command.',
)

assert.match(matrixSource, /config\/document-request-phase1-legal-checklist\.json/, 'The canonical matrix should import the Phase 1 checklist.')
assert.match(matrixSource, /validateDocumentRequestCanonicalMatrix/, 'The canonical matrix should expose structural validation.')
assert.match(policySource, /document_request_canonical_policy_v1/, 'Policy module should carry a stable policy version.')
assert.match(policySource, /pending_policy_rows_are_visible_but_not_requestable_by_default/, 'Policy report should encode pending-policy requestability.')
assert.match(policySource, /property_acquisition_record/, 'Policy module should keep acquisition records deferred.')
assert.match(policySource, /capital_improvement_records/, 'Policy module should keep capital-improvement records deferred.')
assert.match(scriptSource, /document_request_phase1_single_canonical_policy/, 'Phase 1 script should carry a stable phase marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 1 script should report no data mutation.')
assert.match(scriptSource, /strictSignoff/, 'Phase 1 script should expose a strict signoff gate.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 1 should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 1 should not query or mutate database tables.')
assert.match(docs, /Single Canonical Policy/, 'Phase 1 docs should name the phase.')
assert.match(docs, /pending-policy rows are not requestable/i, 'Phase 1 docs should state pending-policy requestability.')
assert.match(docs, /property_acquisition_record/, 'Phase 1 docs should mention deferred acquisition records.')

const validation = validateCanonicalDocumentRequestPolicy()
assert.equal(validation.ok, true, validation.errors.map((issue) => issue.message).join('\n'))

const policy = buildCanonicalDocumentRequestPolicyReport()
assert.equal(policy.version, DOCUMENT_REQUEST_CANONICAL_POLICY_VERSION)
assert.equal(policy.source, DOCUMENT_REQUEST_CANONICAL_POLICY_SOURCE)
assert.equal(policy.singleSourceOfTruth, true)
assert.equal(policy.counts.requirements, 67)
assert.equal(policy.counts.pendingPolicy, 5)
assert.equal(policy.counts.pendingSignoffDecisions, 5)
assert.ok(policy.counts.requestableByDefault > 50)
assert.deepEqual([...policy.deferredKeysAbsentFromPolicy].sort(), [...CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS].sort())
assert.ok(policy.pendingPolicyKeys.includes('buyer_company_beneficial_ownership'))
assert.ok(policy.pendingPolicyKeys.includes('seller_trust_beneficial_ownership'))
assert.equal(policy.requestableByDefaultKeys.includes('property_acquisition_record'), false)
assert.equal(policy.requestableByDefaultKeys.includes('capital_improvement_records'), false)

const mixedPlan = buildCanonicalDocumentRequestPlan({
  buyerEntityType: 'trust',
  sellerEntityType: 'company',
  financeType: 'hybrid',
  sellerHasExistingBond: true,
  propertyType: 'sectional_title',
})
const buyerTrustBo = mixedPlan.requests.find((request) => request.key === 'buyer_trust_beneficial_ownership')
const sellerCompanyBo = mixedPlan.requests.find((request) => request.key === 'seller_company_beneficial_ownership')
assert.equal(buyerTrustBo?.pendingPolicy, true)
assert.equal(buyerTrustBo?.requestable, false)
assert.equal(buyerTrustBo?.blocksStage, null)
assert.equal(sellerCompanyBo?.pendingPolicy, true)
assert.equal(sellerCompanyBo?.requestable, false)

const outputPath = 'output/document-request-phase1-single-canonical-policy.test.json'
execFileSync('node', ['scripts/document-request-phase1-single-canonical-policy.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase1_single_canonical_policy')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'policy_valid_pending_signoff')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.mayProceedToPhase2, true)
assert.equal(report.gate.productionActivationReady, false)
assert.equal(report.scenarioProofs.length, 3)
assert.ok(report.scenarioProofs.some((proof) => proof.nonRequestablePendingPolicyKeys.length > 0))

let strictFailed = false
try {
  execFileSync('node', ['scripts/document-request-phase1-single-canonical-policy.mjs', `--output=${outputPath}`, '--strict-signoff'], {
    stdio: 'pipe',
  })
} catch (error) {
  strictFailed = true
}
if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
assert.equal(strictFailed, true, 'Strict signoff mode should fail while pending signoff decisions remain.')

console.log('document request phase 1 single canonical policy tests passed')
