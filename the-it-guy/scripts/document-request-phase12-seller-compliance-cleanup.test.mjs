import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS,
  buildCanonicalDocumentRequestPolicyReport,
} from '../src/core/documents/documentRequestCanonicalPolicy.js'
import {
  DOCUMENT_REQUEST_CANONICAL_MATRIX,
} from '../src/core/documents/documentRequestCanonicalMatrix.js'
import {
  SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS,
  buildDocumentRequestUploadOwnershipAudit,
} from '../src/core/documents/documentRequestUploadOwnershipModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const checklistSource = fs.readFileSync('config/document-request-phase1-legal-checklist.json', 'utf8')
const attorneyRequirementSource = fs.readFileSync('src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js', 'utf8')
const policySource = fs.readFileSync('src/core/documents/documentRequestCanonicalPolicy.js', 'utf8')
const ownershipSource = fs.readFileSync('src/core/documents/documentRequestUploadOwnershipModel.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase12-seller-compliance-cleanup.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase12-seller-compliance-cleanup.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase12-seller-compliance-cleanup'],
  'node scripts/document-request-phase12-seller-compliance-cleanup.test.mjs',
  'package.json should expose the Phase 12 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase12-seller-compliance-cleanup'],
  'node scripts/document-request-phase12-seller-compliance-cleanup.mjs',
  'package.json should expose the Phase 12 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase12-seller-compliance-cleanup'],
  'npm run verify:document-request-phase11-upload-ownership && npm run test:document-request-phase12-seller-compliance-cleanup && npm run report:document-request-phase12-seller-compliance-cleanup',
  'package.json should expose the Phase 12 verification command.',
)

assert.match(scriptSource, /document_request_phase12_seller_compliance_cleanup/, 'Phase 12 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 12 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 12 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.insert\(/, 'Phase 12 report should not insert data.')
assert.doesNotMatch(scriptSource, /\.update\(/, 'Phase 12 report should not update data.')
assert.doesNotMatch(scriptSource, /\.upsert\(/, 'Phase 12 report should not upsert data.')
assert.match(docs, /Seller Compliance Cleanup/, 'Phase 12 docs should name the phase.')
assert.match(docs, /document generator/i, 'Phase 12 docs should state generator work is out of scope.')

assert.match(ownershipSource, /SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS/, 'Phase 12 should use declared seller external upload keys.')
assert.match(policySource, /UPLOAD_ONLY_ACCEPTED_SIGNOFF_KEYS/, 'Policy validation should recognize upload-only accepted seller external keys.')
assert.equal(SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS.length, 9)

const policy = buildCanonicalDocumentRequestPolicyReport()
const policyWarnings = policy.validation.warnings || []
for (const key of SELLER_EXTERNAL_UPLOAD_DOCUMENT_KEYS) {
  const requirement = DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.find((item) => item.key === key)
  assert.ok(requirement, `${key} should exist in canonical policy.`)
  assert.equal(requirement.ownerRole, 'seller', `${key} should be seller-owned.`)
  assert.equal(requirement.requestedFrom, 'seller', `${key} should be requested from seller.`)
  assert.equal(requirement.visibility, 'client_visible', `${key} should be seller/client visible.`)
  assert.equal(
    policyWarnings.some((warning) => warning.code === 'active_row_has_pending_related_signoff' && warning.requirementKey === key),
    false,
    `${key} should not leak pending signoff warnings after upload-only acceptance.`,
  )
}

assert.equal(
  policyWarnings.some((warning) => warning.code === 'professional_shared_client_owned' && warning.requirementKey === 'vat_status_confirmation'),
  false,
  'VAT status confirmation should no longer be professional-shared client-owned.',
)
assert.match(checklistSource, /"key": "vat_status_confirmation"[\s\S]*"visibility": "client_visible"/, 'Canonical checklist should make VAT seller/client visible.')
assert.doesNotMatch(
  attorneyRequirementSource,
  /id:\s*'vat_status_confirmation'[\s\S]{0,260}visibilityDefault:\s*'professional_shared'/,
  'Attorney VAT request defaults should not be professional-shared.',
)
assert.match(
  attorneyRequirementSource,
  /id:\s*'vat_status_confirmation'[\s\S]{0,260}visibilityDefault:\s*'client_visible'/,
  'Attorney VAT request defaults should be seller/client visible.',
)

const ownershipAudit = buildDocumentRequestUploadOwnershipAudit()
assert.equal(ownershipAudit.ok, true)
assert.equal(ownershipAudit.failures.length, 0)
assert.equal(ownershipAudit.warnings.length, 0)

for (const key of CANONICAL_DOCUMENT_REQUEST_DEFERRED_KEYS) {
  assert.equal(
    DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.some((requirement) => requirement.key === key),
    false,
    `${key} should remain outside canonical policy.`,
  )
}

const outputPath = 'output/document-request-phase12-seller-compliance-cleanup.test.json'
execFileSync('node', ['scripts/document-request-phase12-seller-compliance-cleanup.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase12_seller_compliance_cleanup')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'seller_compliance_cleanup_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.warnings.length, 0)
assert.equal(report.gate.productionActivationReady, true)
assert.equal(report.policyWarningSummary.sellerCompliancePendingSignoffLeaks, 0)
assert.equal(report.policyWarningSummary.sellerProfessionalSharedLeaks, 0)
assert.equal(report.ownershipSummary.warnings, 0)
assert.equal(report.deferredKeyLeaks.length, 0)

console.log('document request phase 12 seller compliance cleanup tests passed')
