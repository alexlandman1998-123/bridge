import { DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION } from '../../lib/documentUploadPolicy.js'

export const DOCUMENT_UPLOAD_RELEASE_SCENARIOS = Object.freeze([
  'upload', 'persistence', 'visibility', 'download', 'retry', 'failedNetwork',
  'reopen', 'replacement', 'expiredUrl', 'roleAccess', 'tenantIsolation',
])

// Inventory from the platform persistence audit. Each variant needs its own
// observations: a buyer finance proof cannot certify a required-document flow.
export const DOCUMENT_UPLOAD_RELEASE_MATRIX = Object.freeze([
  {"id": "buyer", "label": "Buyer portal required/requested documents and finance proofs", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["required", "requested", "financeProof", "financeRequest"]},
  {"id": "buyerOnboarding", "label": "Buyer onboarding required documents", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["required"]},
  {"id": "seller", "label": "Seller portal required documents and reviewed signed copies", "owner": "primary workspace", "source": "src/services/privateListingService.js", "variants": ["required", "reviewedSigned"]},
  {"id": "listing", "label": "Agent listing seller documents and manual offer/mandate evidence", "owner": "primary workspace", "source": "src/services/privateListingService.js", "variants": ["seller", "manualOffer", "mandate"]},
  {"id": "transaction", "label": "Agent/internal shared transaction and finance uploads", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["shared", "finance"]},
  {"id": "lead", "label": "Agent buyer/seller lead packs, OTP offer and formal valuation attachments", "owner": "primary workspace", "source": "src/pages/agency/AgencyPipelinePage.jsx", "variants": ["buyerPack", "sellerPack", "otp", "valuation"]},
  {"id": "developerLead", "label": "Developer buyer lead documents", "owner": "primary workspace", "source": "src/services/documents/developerLeadDocumentsService.js", "variants": ["buyer"]},
  {"id": "attorneyVersions", "label": "Attorney evidence, drafts, final/signed versions and requested uploads", "owner": "primary workspace", "source": "src/services/documents/attorneyDocumentPersistence.js", "variants": ["evidence", "draft", "final", "version", "requested"]},
  {"id": "attorney", "label": "Attorney closeout documents", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["closeout"]},
  {"id": "bond", "label": "Bond closeout documents", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["closeout"]},
  {"id": "bondApplication", "label": "Buyer bond application supporting documents", "owner": "primary workspace", "source": "src/modules/bond/application/workspace/bondApplicationRuntimeService.js", "variants": ["supporting"]},
  {"id": "bondWetInk", "label": "Bond wet-ink signed PDFs", "owner": "primary workspace", "source": "src/services/bondWetInkSigningService.js", "variants": ["signedPdf"]},
  {"id": "external", "label": "External transaction/role-player document portal", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["rolePlayer"]},
  {"id": "developer", "label": "Developer document portal", "owner": "primary workspace", "source": "src/services/developerDocumentPortalService.js", "variants": ["portal"]},
  {"id": "developmentAssets", "label": "Development marketing/supporting document assets", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["supporting"]},
  {"id": "rental", "label": "Rental applicant document collection and multi-file packs", "owner": "primary workspace", "source": "server/services/rentalApplicationDocumentUpload.js", "variants": ["single", "multiFile"]},
  {"id": "rentalAgent", "label": "Agent uploads on behalf of rental applicants", "owner": "primary workspace", "source": "server/services/rentalApplicationAgentDocumentApi.js", "variants": ["onBehalf"]},
  {"id": "rentalLandlord", "label": "Rental landlord onboarding and signed evidence", "owner": "primary workspace", "source": "server/services/rentalLandlordOnboardingApi.js", "variants": ["supporting", "signed"]},
  {"id": "commercialWorkspace", "label": "Commercial workspace documents", "owner": "primary workspace", "source": "src/modules/commercial/services/commercialApi.js", "variants": ["workspace"]},
  {"id": "commercial", "label": "Commercial transaction portal documents", "owner": "primary workspace", "source": "src/modules/commercial/services/commercialPortalApi.js", "variants": ["portal"]},
  {"id": "commercialTenant", "label": "Commercial applicant/tenant onboarding portal", "owner": "primary workspace", "source": "src/modules/commercial/services/commercialOnboardingApi.js", "variants": ["tenant"]},
  {"id": "commercialLandlord", "label": "Commercial landlord onboarding portal", "owner": "primary workspace", "source": "src/modules/commercial/services/commercialLandlordService.js", "variants": ["landlord"]},
  {"id": "legalTemplates", "label": "Legal template uploads", "owner": "primary workspace", "source": "src/lib/documentPacketsApi.js", "variants": ["docx"]},
  {"id": "signedPackets", "label": "Physical signed legal packets and digital signature assets", "owner": "primary workspace", "source": "src/lib/documentPacketsApi.js", "variants": ["physicalSigned", "signatureAsset"]},
  {"id": "recruitment", "label": "Recruitment documents, contract templates, signed contracts and onboarding evidence", "owner": "primary workspace", "source": "src/services/recruitmentService.js", "variants": ["applicant", "template", "signedContract", "onboarding"]},
  {"id": "fic", "label": "FIC compliance policy PDFs", "owner": "primary workspace", "source": "src/services/branchFicTrainingService.js", "variants": ["policyPdf"]},
  {"id": "partner", "label": "Partner/bond partner supporting document stores", "owner": "primary workspace", "source": "src/lib/api.js", "variants": ["partner", "bondPartner"]}
].map((surface) => Object.freeze({ ...surface, variants: Object.freeze(surface.variants) })))

export const DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS = Object.freeze([
  '20260918195906_transaction_document_recovery_review_queue',
  '20260918200208_document_upload_policy_storage_enforcement',
])

const hash = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''))
const present = (value) => typeof value === 'string' && value.trim().length > 0
const contextKeys = ['tenantId', 'ownerType', 'ownerId', 'slotKey', 'partyId']
const sameContext = (record, intended) => record && intended && contextKeys.every((key) => present(record[key]) && record[key] === intended[key])

function validObservation(scenario, observation = {}, upload = {}) {
  observation = observation || {}
  if (!present(observation.documentId) || !present(observation.bucket) || !present(observation.path)) return false
  // Correct bytes under the wrong transaction, person or requirement are not
  // a successful upload. Normalize each owning store's keys into this context.
  if (!sameContext(observation.recordContext, upload.intendedContext)) return false
  if (scenario !== 'replacement' && ['persistence', 'reopen', 'visibility', 'download', 'retry', 'failedNetwork', 'expiredUrl'].includes(scenario)) {
    if (['documentId', 'bucket', 'path'].some((key) => observation[key] !== upload[key])) return false
  }
  if (scenario === 'upload') return observation.metadataSaved === true && observation.objectExists === true && hash(observation.sourceSha256) && observation.sourceBytes > 0
  if (scenario === 'persistence' || scenario === 'reopen') return observation.freshRead === true && observation.objectExists === true
  if (scenario === 'visibility') return observation.visible === true && observation.reviewStatusPreserved === true
  if (scenario === 'download' || scenario === 'expiredUrl') {
    const bytesMatch = hash(observation.expectedSha256) && observation.actualSha256 === observation.expectedSha256 && observation.expectedSha256 === upload.sourceSha256 && observation.expectedBytes === upload.sourceBytes && observation.expectedBytes > 0 && observation.actualBytes === observation.expectedBytes
    return bytesMatch && (scenario !== 'expiredUrl' || (observation.expiredLinkRejected === true && observation.freshLinkRequested === true))
  }
  if (scenario === 'retry' || scenario === 'failedNetwork') return observation.metadataRows === 1 && observation.storageObjects === 1 && observation.recovered === true && observation.faultInjected === true
  if (scenario === 'replacement') return observation.previousDocumentId === upload.documentId && observation.previousPath === upload.path && observation.path !== upload.path && observation.latestOnFreshRead === true && observation.previousVersionRetained === true && hash(observation.actualSha256) && observation.actualSha256 === observation.expectedSha256
  if (scenario === 'roleAccess') return present(observation.allowedActor) && present(observation.deniedActor) && observation.allowedActor !== observation.deniedActor && observation.allowedDownload === true && observation.deniedMetadata === true && observation.deniedStorage === true
  if (scenario === 'tenantIsolation') return present(observation.ownerTenant) && present(observation.otherTenant) && observation.ownerTenant !== observation.otherTenant && observation.deniedMetadata === true && observation.deniedStorage === true && observation.deniedWrite === true
  return false
}

// These are assertions from an acceptance run, not cryptographic attestations.
// A local fixture receipt is useful regression evidence, never hosted RLS proof.
export function buildDocumentUploadReleaseReadiness({
  evidenceBySurface = {}, appliedMigrationVersions = [],
  malwareScan = DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION,
  target = {}, now = Date.now(), maxEvidenceAgeMs = 24 * 60 * 60 * 1000,
} = {}) {
  const targetValid = target && ['environment', 'projectId', 'buildId', 'runId'].every((key) => present(target[key])) && ['preview', 'staging', 'production'].includes(target.environment) && Number.isFinite(now) && Number.isFinite(maxEvidenceAgeMs) && maxEvidenceAgeMs > 0
  const applied = new Set(appliedMigrationVersions)
  const missingMigrations = DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS.filter((version) => !applied.has(version))
  const matrix = DOCUMENT_UPLOAD_RELEASE_MATRIX.map((surface) => {
    const missing = []
    for (const variant of surface.variants) {
      const receipts = evidenceBySurface?.[surface.id]?.[variant] || {}
      const upload = receipts.upload?.observation || {}
      for (const scenario of DOCUMENT_UPLOAD_RELEASE_SCENARIOS) {
        const receipt = receipts[scenario]
        const checked = Date.parse(receipt?.checkedAt)
        const matchesTarget = targetValid && ['environment', 'projectId', 'buildId', 'runId'].every((key) => receipt?.[key] === target[key])
        const matchesJourney = receipt?.surfaceId === surface.id && receipt?.variant === variant && receipt?.scenario === scenario
        if (!matchesTarget || !matchesJourney || receipt?.mode !== 'hosted' || receipt?.status !== 'passed' || !present(receipt?.artifact) || !hash(receipt?.artifactSha256) || !Number.isFinite(checked) || checked > now || now - checked > maxEvidenceAgeMs || !validObservation(scenario, receipt?.observation, upload)) missing.push(`${variant}:${scenario}`)
      }
    }
    return { ...surface, missingScenarios: missing, ready: missing.length === 0 }
  })
  const blockers = [
    ...(!targetValid ? ['A specific hosted environment, project, build and acceptance run are required.'] : []),
    ...matrix.filter((surface) => !surface.ready).map((surface) => `${surface.label}: ${surface.missingScenarios.join(', ')}`),
    ...missingMigrations.map((version) => `Migration not applied: ${version}`),
  ]
  if (malwareScan?.scanned !== true) blockers.push(malwareScan?.releaseBlocker || 'A server-side malware scanner must be configured before release.')
  return {
    ready: blockers.length === 0, target, matrix, blockers, missingMigrations,
    scannerConfigured: malwareScan?.scanned === true,
    summary: { surfaces: matrix.length, readySurfaces: matrix.filter((surface) => surface.ready).length, variants: matrix.reduce((sum, surface) => sum + surface.variants.length, 0), requiredScenarios: DOCUMENT_UPLOAD_RELEASE_SCENARIOS.length },
  }
}
