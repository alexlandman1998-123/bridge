import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS,
  SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
  buildSellerCanonicalDocumentScenario,
  buildSellerDocumentCanonicalCleanupAudit,
  buildSellerDocumentCanonicalCleanupProfile,
} from '../src/services/documents/sellerDocumentCanonicalCleanupService.js'
import { getSellerRequiredDocuments } from '../src/services/sellerDocumentRequirementsService.js'
import {
  SELLER_CAPTURE_ONLY_REQUIREMENT_KEYS,
  SELLER_DOCUMENT_REQUEST_RUNTIME_POLICY_VERSION,
  filterSellerClientUploadRequirements,
  isPendingSellerDocumentPolicyRequirement,
  isProfessionalOnlySellerRequirement,
  isSellerCaptureOnlyRequirement,
} from '../src/core/documents/sellerDocumentRequestRuntimePolicy.js'
import { resolveDocumentRequestUploadOwnership } from '../src/core/documents/documentRequestUploadOwnershipModel.js'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const serviceSource = fs.readFileSync('src/services/documents/sellerDocumentCanonicalCleanupService.js', 'utf8')
const portalSource = fs.readFileSync('src/services/clientPortalWorkspaceService.js', 'utf8')
const runtimePolicySource = fs.readFileSync('src/core/documents/sellerDocumentRequestRuntimePolicy.js', 'utf8')
const scriptSource = fs.readFileSync('scripts/document-request-phase5-seller-cleanup.mjs', 'utf8')
const docs = fs.readFileSync('docs/document-request-phase5-seller-cleanup.md', 'utf8')

assert.equal(
  packageJson.scripts['test:document-request-phase5-seller-cleanup'],
  'node scripts/document-request-phase5-seller-cleanup.test.mjs',
  'package.json should expose the Phase 5 contract test.',
)
assert.equal(
  packageJson.scripts['report:document-request-phase5-seller-cleanup'],
  'node scripts/document-request-phase5-seller-cleanup.mjs',
  'package.json should expose the Phase 5 report.',
)
assert.equal(
  packageJson.scripts['verify:document-request-phase5-seller-cleanup'],
  'npm run verify:document-request-phase4-bond-model && npm run test:document-request-phase5-seller-cleanup && npm run report:document-request-phase5-seller-cleanup',
  'package.json should expose the Phase 5 verification command.',
)

assert.match(serviceSource, /seller_document_canonical_cleanup_v1/, 'Seller cleanup service should carry a stable version.')
assert.match(serviceSource, /DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS/, 'Seller cleanup service should name deferred seller upload keys.')
assert.match(serviceSource, /buildDocumentRequestContainerModel/, 'Seller cleanup should use Phase 2 request containers.')
assert.match(runtimePolicySource, /isDeferredSellerUploadRequirement/, 'The shared seller policy should filter deferred uploads.')
assert.match(runtimePolicySource, /isSellerCaptureOnlyRequirement/, 'The shared seller policy should filter structured onboarding facts.')
assert.match(runtimePolicySource, /isPendingSellerDocumentPolicyRequirement/, 'The shared seller policy should filter unsigned policy requests.')
assert.match(runtimePolicySource, /isProfessionalOnlySellerRequirement/, 'The shared seller policy should filter professionally owned requests.')
assert.match(portalSource, /if \(isClientPortalProfessionalOnlyRequirement\(requirement\)\) return false/, 'Professional-only requests should remain hidden from every client workspace.')
assert.match(portalSource, /workspaceMode === 'selling' && !isSellerClientUploadRequirementAllowed\(requirement\)/, 'Seller portal policy enforcement should be scoped to selling workspaces.')
assert.match(scriptSource, /document_request_phase5_seller_cleanup/, 'Phase 5 script should carry a stable marker.')
assert.match(scriptSource, /mutatedData:\s*false/, 'Phase 5 report should be read-only.')
assert.doesNotMatch(scriptSource, /createClient/, 'Phase 5 report should not connect to Supabase.')
assert.doesNotMatch(scriptSource, /\.from\(/, 'Phase 5 report should not query or mutate database tables.')
assert.match(docs, /Seller-Side Cleanup/, 'Phase 5 docs should name the phase.')
assert.match(docs, /property_acquisition_record/, 'Phase 5 docs should record the deferred acquisition decision.')

const audit = buildSellerDocumentCanonicalCleanupAudit()
assert.equal(audit.version, SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION)
assert.ok(audit.scenarioCount >= 10)
assert.equal(audit.summary.unmappedCount, 0)
assert.equal(audit.summary.deferredSellerUploadCount, 0)
assert.ok(audit.summary.missingCoveredByCanonicalPlanCount > 0)
assert.ok(audit.summary.duplicateCanonicalGroupCount > 0)

for (const scenarioId of ['company_seller', 'trust_seller', 'deceased_estate', 'power_of_attorney', 'conditional_compliance']) {
  assert.ok(audit.results.some((result) => result.id === scenarioId), `${scenarioId} should be covered by the seller audit.`)
}

const company = audit.results.find((result) => result.id === 'company_seller')?.profile
assert.ok(company.sellerClientUploadKeys.includes('seller_company_registration'))
assert.ok(company.sellerClientUploadKeys.includes('seller_company_resolution'))
assert.ok(company.sellerClientUploadKeys.includes('seller_director_fica'))
assert.ok(company.canonicalPlanKeys.includes('seller_company_beneficial_ownership'))

const trust = audit.results.find((result) => result.id === 'trust_seller')?.profile
assert.ok(trust.sellerClientUploadKeys.includes('seller_trust_deed'))
assert.ok(trust.sellerClientUploadKeys.includes('seller_letters_of_authority'))
assert.ok(trust.sellerClientUploadKeys.includes('seller_trustee_resolution'))
assert.ok(trust.sellerClientUploadKeys.includes('seller_trustee_fica'))
assert.ok(trust.canonicalPlanKeys.includes('seller_trust_beneficial_ownership'))

const bonded = audit.results.find((result) => result.id === 'married_cop_existing_bond')?.profile
assert.ok(bonded.sellerClientUploadKeys.includes('bond_statement'))
assert.equal(bonded.sellerClientUploadKeys.includes('bond_cancellation_figures'), false)

const conditional = audit.results.find((result) => result.id === 'conditional_compliance')?.profile
for (const key of ['gas_compliance_certificate', 'electric_fence_certificate', 'solar_compliance_documents', 'water_installation_certificate', 'beetle_certificate']) {
  assert.ok(conditional.sellerClientUploadKeys.includes(key), `${key} should be seller-uploadable when triggered.`)
}

const staleListing = {
  id: 'phase5-stale-listing',
  listingStatus: 'onboarding_completed',
  lifecycleStatus: 'onboarding_completed',
  sellerOnboardingStatus: 'completed',
  sellerOnboarding: {
    status: 'completed',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'single',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 2250000,
    },
  },
  documentRequirements: DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS.map((key) => ({
    key,
    requirement_key: key,
    requirement_name: key,
    visibility: 'seller_visible',
    document_visibility: 'seller_visible',
    status: 'required',
    is_required: true,
  })),
}
const staleRequiredDocuments = getSellerRequiredDocuments(staleListing, staleListing.sellerOnboarding.formData)
for (const key of DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS) {
  assert.equal(staleRequiredDocuments.some((row) => row.key === key || row.requirement_key === key), false, `${key} should be filtered from seller requirements.`)
}

assert.equal(SELLER_DOCUMENT_REQUEST_RUNTIME_POLICY_VERSION, 'seller_document_request_runtime_policy_v1')
const policyRows = [
  {
    key: 'seller_bank_account_confirmation',
    canonicalDocumentRequestOwnerRole: 'seller',
    canonicalDocumentRequestVisibility: 'client_visible',
  },
  {
    key: 'bond_cancellation_figures',
    canonicalDocumentRequestOwnerRole: 'cancellation_attorney',
    canonicalDocumentRequestVisibility: 'professional_shared',
  },
  {
    key: 'approved_building_plans',
    canonicalDocumentRequestOwnerRole: 'seller',
    canonicalDocumentRequestVisibility: 'client_visible',
    canonicalDocumentRequestLevel: 'pending_policy_legal',
  },
  { key: 'capital_improvement_records', visibility: 'seller_visible' },
  { key: 'body_corporate_details', visibility: 'seller_visible' },
  { key: 'hoa_contact_details', visibility: 'seller_visible' },
]
const filteredPolicyRows = filterSellerClientUploadRequirements(policyRows)
assert.deepEqual(filteredPolicyRows.map((row) => row.key), ['seller_bank_account_confirmation'])
assert.equal(isProfessionalOnlySellerRequirement(policyRows[1]), true)
assert.equal(isPendingSellerDocumentPolicyRequirement(policyRows[2]), true)
assert.deepEqual(SELLER_CAPTURE_ONLY_REQUIREMENT_KEYS, ['body_corporate_details', 'hoa_contact_details', 'hoa_details'])
assert.equal(isSellerCaptureOnlyRequirement(policyRows[4]), true)
assert.equal(isSellerCaptureOnlyRequirement(policyRows[5]), true)

const sellerOwnership = resolveDocumentRequestUploadOwnership({
  documentKey: 'seller_bank_account_confirmation',
  ownerRole: 'seller',
  requestedFrom: 'seller',
  visibility: 'client_visible',
})
assert.equal(sellerOwnership.responsiblePartyRole, 'seller')
assert.equal(sellerOwnership.agentMayUploadOnBehalf, true)
assert.ok(sellerOwnership.uploadableByRoles.includes('agent'))

const profile = buildSellerDocumentCanonicalCleanupProfile({
  id: 'phase5-direct-profile',
  formData: {
    sellerType: 'individual',
    maritalStatus: 'single',
    propertyTitleType: 'freehold',
    propertyCategory: 'residential',
    askingPrice: 2200000,
  },
})
const scenario = buildSellerCanonicalDocumentScenario(profile, profile.scenario)
assert.equal(profile.version, SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION)
assert.equal(scenario.sellerEntityType, 'individual')
assert.ok(profile.containerSummary.total > 0)

const outputPath = 'output/document-request-phase5-seller-cleanup.test.json'
execFileSync('node', ['scripts/document-request-phase5-seller-cleanup.mjs', `--output=${outputPath}`], {
  stdio: 'pipe',
})
const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
fs.unlinkSync(outputPath)
assert.equal(report.phase, 'document_request_phase5_seller_cleanup')
assert.equal(report.commit, false)
assert.equal(report.mutatedData, false)
assert.equal(report.gate.status, 'seller_cleanup_mapped_with_warnings')
assert.equal(report.gate.ok, true)
assert.equal(report.summary.unmappedCount, 0)
assert.equal(report.summary.deferredSellerUploadCount, 0)
assert.ok(report.scenarioCount >= 10)

console.log('document request phase 5 seller cleanup tests passed')
