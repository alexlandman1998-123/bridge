import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  BUYER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
  buildBuyerDocumentCanonicalCleanupAudit,
  buildBuyerDocumentCanonicalCleanupProfile,
} from '../src/services/documents/buyerDocumentCanonicalCleanupService.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const serviceSource = fs.readFileSync('src/services/documents/buyerDocumentCanonicalCleanupService.js', 'utf8')
const portalSource = fs.readFileSync('src/services/clientPortalWorkspaceService.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase3-buyer-cleanup.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase3-buyer-cleanup.md', 'utf8')

const bundleDir = await mkdtemp(path.join(tmpdir(), 'document-request-phase3-buyer-cleanup-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')
await writeFile(entryPath, `export { buildDocumentCenter } from ${JSON.stringify(servicePath)}\n`)
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

assert.equal(
  packageJson.scripts['test:document-request-phase3-buyer-cleanup'],
  'node scripts/document-request-phase3-buyer-cleanup.test.mjs',
  'package.json should expose the Phase 3 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase3-buyer-cleanup'],
  'node scripts/document-request-phase3-buyer-cleanup.mjs',
  'package.json should expose the Phase 3 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase3-buyer-cleanup'],
  'npm run verify:document-request-phase2-containers && npm run test:document-request-phase3-buyer-cleanup && npm run report:document-request-phase3-buyer-cleanup',
  'package.json should expose the Phase 3 verification command.',
)

assert.match(serviceSource, /buyer_document_canonical_cleanup_v1/, 'Buyer cleanup service should carry a stable version.')
assert.match(serviceSource, /PROFESSIONAL_ONLY_CANONICAL_KEYS/, 'Buyer cleanup should classify professional/generated rows.')
assert.match(serviceSource, /buildCanonicalDocumentRequestAudiencePlan/, 'Buyer cleanup should use the canonical buyer audience plan.')
assert.match(serviceSource, /buildDocumentRequestContainerModel/, 'Buyer cleanup should prove buyer containers.')
assert.match(portalSource, /isClientPortalProfessionalOnlyRequirement/, 'Portal should filter professional-only legacy buyer rows.')
assert.match(scriptSource, /document_request_phase3_buyer_cleanup/, 'Phase 3 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 3 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 3 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 3 report should not query or mutate database tables.')
assert.match(docs, /Buyer-Side Cleanup/, 'Phase 3 docs should name the phase.')
assert.match(docs, /OTP and transfer documents/i, 'Phase 3 docs should mention professional/generated document cleanup.')

const companyBond = buildBuyerDocumentCanonicalCleanupProfile({
  formData: {
    purchaser_type: 'company',
    purchaser_entity_type: 'company',
    purchase_finance_type: 'bond',
  },
})
assert.equal(companyBond.version, BUYER_DOCUMENT_CANONICAL_CLEANUP_VERSION)
assert.equal(companyBond.unmappedRows.length, 0)
assert.ok(companyBond.professionalOnlyLegacyRows.some((row) => row.canonicalKey === 'signed_otp'))
assert.ok(companyBond.professionalOnlyLegacyRows.some((row) => row.canonicalKey === 'transfer_documents'))
assert.ok(companyBond.buyerClientUploadKeys.includes('buyer_company_registration'))
assert.ok(companyBond.buyerClientUploadKeys.includes('income_affordability_documents'))
assert.equal(companyBond.requestableBuyerClientUploadKeys.includes('buyer_company_beneficial_ownership'), false)
assert.ok(companyBond.pendingPolicyLegacyRows.some((row) => row.canonicalKey === 'buyer_company_beneficial_ownership'))

const marriedAnc = buildBuyerDocumentCanonicalCleanupProfile({
  formData: {
    purchaser_type: 'married_anc',
    purchaser_entity_type: 'individual',
    marital_status: 'married',
    marital_regime: 'out_of_community',
    spouse_full_name: 'Example Spouse',
    employment_type: 'self-employed',
    purchase_finance_type: 'bond',
  },
})
assert.ok(marriedAnc.pendingPolicyLegacyRows.some((row) => row.canonicalKey === 'buyer_anc_document'))
assert.ok(marriedAnc.missingFromLegacyButCoveredByCanonicalPlan.includes('buyer_marital_status_details'))

const audit = buildBuyerDocumentCanonicalCleanupAudit()
assert.equal(audit.summary.unmappedCount, 0)
assert.ok(audit.summary.professionalOnlyLegacyCount > 0)
assert.ok(audit.summary.missingCoveredByCanonicalPlanCount > 0)

const portalModel = buildDocumentCenter({
  transaction: {
    id: 'phase3-buyer-portal',
    purchaser_type: 'company',
    finance_type: 'bond',
  },
  canonicalDocumentRequestScenario: {
    buyerEntityType: 'company',
    financeType: 'bond',
  },
  requiredDocuments: [
    {
      key: 'otp',
      label: 'Offer to Purchase',
      expectedFromRole: 'buyer',
      canonicalDocumentRequestKey: 'signed_otp',
      canonicalDocumentRequestVisibility: 'professional_shared',
      canonicalDocumentRequestOwnerRole: 'agent',
      status: 'required',
    },
    {
      key: 'transfer_documents',
      label: 'Transfer Documents',
      expectedFromRole: 'attorney',
      canonicalDocumentRequestKey: 'transfer_documents',
      canonicalDocumentRequestVisibility: 'professional_shared',
      canonicalDocumentRequestOwnerRole: 'transfer_attorney',
      status: 'required',
    },
    {
      key: 'cipc_registration',
      label: 'CIPC Registration',
      expectedFromRole: 'buyer',
      canonicalDocumentRequestKey: 'buyer_company_registration',
      canonicalDocumentRequestVisibility: 'client_visible',
      canonicalDocumentRequestOwnerRole: 'buyer',
      status: 'required',
    },
  ],
  documents: [],
  additionalDocumentRequests: [],
}, 'buying')
const portalKeys = new Set(portalModel.requiredDocuments.map((item) => item.key || item.sourceId))
assert.equal(portalKeys.has('otp'), false)
assert.equal(portalKeys.has('transfer_documents'), false)
assert.equal(portalKeys.has('cipc_registration'), true)
assert.ok(portalKeys.has('buyer_company_resolution'), 'canonical overlay should still add missing buyer upload rows')

const outputPath = 'output/document-request-phase3-buyer-cleanup.test.json'
execFileSync('node', ['scripts/document-request-phase3-buyer-cleanup.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase3_buyer_cleanup')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'buyer_cleanup_mapped_with_warnings')
assert.equal(report.gate.ok, true)
assert.equal(report.gate.mayProceedToPhase4, true)
assert.equal(report.audit.summary.unmappedCount, 0)

console.log('document request phase 3 buyer cleanup tests passed')
