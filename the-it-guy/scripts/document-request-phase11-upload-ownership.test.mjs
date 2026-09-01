import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  buildDocumentRequestUploadOwnershipAudit,
  resolveDocumentRequestUploadOwnership,
} from '../src/core/documents/documentRequestUploadOwnershipModel.js'
import {
  normalizeRequiredDocumentContainer,
} from '../src/core/documents/documentRequestContainerModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const ownershipSource = fs.readFileSync('src/core/documents/documentRequestUploadOwnershipModel.js', 'utf8')
const containerSource = fs.readFileSync('src/core/documents/documentRequestContainerModel.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase11-upload-ownership.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase11-upload-ownership.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase11-upload-ownership'],
  'node scripts/document-request-phase11-upload-ownership.test.mjs',
  'package.json should expose the Phase 11 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase11-upload-ownership'],
  'node scripts/document-request-phase11-upload-ownership.mjs',
  'package.json should expose the Phase 11 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase11-upload-ownership'],
  'npm run verify:document-request-phase10-release-readiness && npm run test:document-request-phase11-upload-ownership && npm run report:document-request-phase11-upload-ownership',
  'package.json should expose the Phase 11 verification command.',
)

assert.match(ownershipSource, /DOCUMENT_REQUEST_UPLOAD_OWNERSHIP_MODEL_VERSION/, 'Phase 11 ownership model should expose a stable version.')
assert.match(ownershipSource, /SELLER_EXTERNAL_UPLOAD_KEYS/, 'Phase 11 should encode seller external upload keys.')
assert.match(ownershipSource, /PROFESSIONAL_ONLY_KEYS/, 'Phase 11 should encode professional-only upload keys.')
assert.match(ownershipSource, /BOND_ORIGINATOR_ASSISTED_KEYS/, 'Phase 11 should encode bond originator assisted keys.')
assert.match(ownershipSource, /agentMayUploadOnBehalf/, 'Phase 11 should expose agent upload-on-behalf support.')
assert.match(containerSource, /uploadOwnership/, 'Containers should carry upload ownership metadata.')
assert.match(containerSource, /responsiblePartyRole/, 'Containers should expose responsible party role.')
assert.match(containerSource, /uploadableByRoles/, 'Containers should expose uploadable roles.')
assert.match(scriptSource, /document_request_phase11_upload_ownership/, 'Phase 11 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 11 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 11 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.insert\(/, 'Phase 11 report should not insert data.')
assert.doesNotMatch(scriptSource, /\.update\(/, 'Phase 11 report should not update data.')
assert.doesNotMatch(scriptSource, /\.upsert\(/, 'Phase 11 report should not upsert data.')
assert.match(docs, /Upload Ownership/, 'Phase 11 docs should name the phase.')
assert.match(docs, /agent uploads on behalf/i, 'Phase 11 docs should explain upload-on-behalf.')
assert.match(docs, /document generator/i, 'Phase 11 docs should state generator work is out of scope.')

const sellerCompliance = resolveDocumentRequestUploadOwnership({
  key: 'electrical_compliance_certificate',
  ownerRole: 'seller',
  requestedFrom: 'seller',
  visibility: 'client_visible',
})
assert.equal(sellerCompliance.responsiblePartyRole, 'seller')
assert.equal(sellerCompliance.agentMayUploadOnBehalf, true)
assert.ok(sellerCompliance.uploadableByRoles.includes('seller'))
assert.ok(sellerCompliance.uploadableByRoles.includes('agent'))

const transferDocuments = resolveDocumentRequestUploadOwnership({
  key: 'transfer_documents',
  ownerRole: 'transfer_attorney',
  requestedFrom: 'transfer_attorney',
  visibility: 'professional_shared',
})
assert.equal(transferDocuments.professionalOnly, true)
assert.equal(transferDocuments.clientUploadDebt, false)
assert.equal(transferDocuments.responsiblePartyRole, 'transfer_attorney')

const signedOtp = resolveDocumentRequestUploadOwnership({
  key: 'signed_otp',
  ownerRole: 'agent',
  requestedFrom: 'buyer',
  visibility: 'client_visible',
})
assert.equal(signedOtp.professionalOnly, false)
assert.equal(signedOtp.clientUploadDebt, true)
assert.equal(signedOtp.responsiblePartyRole, 'buyer')
assert.ok(signedOtp.uploadableByRoles.includes('buyer'))
assert.ok(signedOtp.uploadableByRoles.includes('agent'))

const bondDocuments = resolveDocumentRequestUploadOwnership({
  key: 'income_affordability_documents',
  ownerRole: 'buyer',
  requestedFrom: 'buyer',
  visibility: 'client_visible',
})
assert.equal(bondDocuments.responsiblePartyRole, 'buyer')
assert.equal(bondDocuments.bondOriginatorAssisted, true)
assert.ok(bondDocuments.uploadableByRoles.includes('bond_originator'))

const sellerContainer = normalizeRequiredDocumentContainer({
  transactionId: 'phase11-test',
  key: 'seller_id_document',
  label: 'Seller ID',
  ownerRole: 'seller',
  requestedFrom: 'seller',
  visibility: 'client_visible',
})
assert.equal(sellerContainer.responsiblePartyRole, 'seller')
assert.equal(sellerContainer.uploadOnBehalfAllowed, true)
assert.ok(sellerContainer.uploadableByRoles.includes('agent'))

const audit = buildDocumentRequestUploadOwnershipAudit()
assert.equal(audit.ok, true)
assert.equal(audit.failures.length, 0)
assert.ok(audit.total > 60)
assert.ok(audit.clientUploadDebtCount > 0)
assert.ok(audit.professionalOnlyCount > 0)
assert.ok(audit.agentOnBehalfCount > 0)

const outputPath = 'output/document-request-phase11-upload-ownership.test.json'
execFileSync('node', ['scripts/document-request-phase11-upload-ownership.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)

assert.equal(report.phase, 'document_request_phase11_upload_ownership')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'upload_ownership_mapped')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.failed.length, 0)
assert.equal(report.gate.mayProceedToPhase12, true)
assert.equal(report.gate.productionActivationReady, true)
assert.equal(report.gate.warnings.length, 0)

console.log('document request phase 11 upload ownership tests passed')
