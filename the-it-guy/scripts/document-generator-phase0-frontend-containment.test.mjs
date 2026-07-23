import assert from 'node:assert/strict'
import fs from 'node:fs'

const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
assert.match(workspace, /function hasConfirmedSigningDelivery\(result = null\)[\s\S]{0,300}emailConfirmed === true/)
const deliveryHelper = workspace.slice(workspace.indexOf('function hasConfirmedSigningDelivery'), workspace.indexOf('function extractMandateValidationPayload'))
assert.doesNotMatch(deliveryHelper, /recipientEmail/)
assert.match(workspace, /SIGNING_DELIVERY_DISABLED/)
assert.match(workspace, /SIGNING_EMAIL_UNCONFIRMED/)
assert.doesNotMatch(workspace, /handleManualSignedUpload/)
assert.doesNotMatch(workspace, /uploadFinalSignedPacketArtifact/)
assert.doesNotMatch(workspace, /updateDocumentPacketVersionFinalArtifact/)
assert.doesNotMatch(workspace, /recordPhysicalDownloadEvent/)
assert.match(workspace, /Physical completion is paused until the server can capture the signed PDF/)

const deliveryCheck = workspace.lastIndexOf('if (!hasConfirmedSigningDelivery(sendResult))')
assert.ok(deliveryCheck >= 0, 'delivery confirmation must gate the dispatch result')
assert.doesNotMatch(workspace, /completeAppliedEnvelopeDispatch/)
assert.doesNotMatch(workspace, /transitionLifecycleState\('sent'\)/)
assert.doesNotMatch(workspace, /lifecycle_state: 'sent'/)
assert.match(workspace, /dispatchId: normalizeText\(linkResult\?\.dispatchId\)/)
assert.match(workspace, /await refreshWorkspaceData\(\{ force: true \}\)/)

const otpTemplateReferenceGuard = workspace.slice(
  workspace.indexOf('async function ensureTemplateReferenceBeforeSend()'),
  workspace.indexOf('\n  function buildVersionLifecycleSummary'),
)
assert.match(otpTemplateReferenceGuard, /OTP_CANONICAL_TEMPLATE_REFERENCE_REQUIRED/)
assert.match(otpTemplateReferenceGuard, /if \(isOtpPacket && !isUuidLike\(packet\?\.template_id\)\)/)
assert.ok(
  otpTemplateReferenceGuard.indexOf('OTP_CANONICAL_TEMPLATE_REFERENCE_REQUIRED') < otpTemplateReferenceGuard.indexOf('resolveActiveTemplate({'),
  'OTP must fail before the mandate template-backfill fallback can run.',
)

const packetsApi = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const signingLinksApi = packetsApi.slice(
  packetsApi.indexOf('export async function generateDocumentPacketSigningLinks'),
  packetsApi.indexOf('export async function generateFinalSignedDocument'),
)
assert.match(signingLinksApi, /promotePacketToSigningPrep/)
assert.doesNotMatch(signingLinksApi, /transitionDocumentPacketLifecycle\(/)
assert.match(signingLinksApi, /status: \['signed', 'declined'\][\s\S]{0,180}'ready_to_send'/)

const unitDetail = fs.readFileSync('src/pages/UnitDetail.jsx', 'utf8')
assert.doesNotMatch(unitDetail, /handleReleaseOtpToClient/)
assert.doesNotMatch(unitDetail, /OTP_DOCUMENT_TYPES\.sentToClient/)
assert.doesNotMatch(unitDetail, /handleSignedOtpSelected/)
assert.doesNotMatch(unitDetail, /finalizeSignedOtpWorkflow/)
// Unit Detail no longer renders a dormant OTP workspace with delivery
// disabled. It is a navigation-only entry point into the canonical workspace.
assert.doesNotMatch(unitDetail, /<LegalDocumentWorkspace/)
assert.match(unitDetail, /function buildOtpLegalWorkspacePath\(mode = 'view', options = \{\}\)/)
assert.match(unitDetail, /return `\/transactions\/\$\{resolvedTransactionId\}\/legal\/otp\?\$\{params\.toString\(\)\}`/)
assert.match(unitDetail, /function openOtpLegalWorkspace\(mode = 'view'\)/)

const subprocess = fs.readFileSync('src/components/SubprocessWorkflowPanel.jsx', 'utf8')
assert.doesNotMatch(subprocess, /finalizeSignedOtpWorkflow/)
assert.match(subprocess, /documentType: 'manual_otp_evidence'/)
assert.match(subprocess, /This does not finalize the OTP or advance the transaction\./)
assert.match(subprocess, /manual_otp_evidence_uploaded: true/)
assert.doesNotMatch(subprocess, /signed_otp_received: true/)

const agentListing = fs.readFileSync('src/pages/AgentListingDetail.jsx', 'utf8')
const manualMandateUpload = agentListing.slice(
  agentListing.indexOf('async function handleSignedMandateUpload'),
  agentListing.indexOf('function handleFollowUpAction'),
)
assert.match(manualMandateUpload, /documentType: 'manual_mandate_evidence'/)
assert.doesNotMatch(manualMandateUpload, /mandateStatus: 'signed_uploaded'/)
assert.doesNotMatch(manualMandateUpload, /listingStatus:/)
assert.match(agentListing, /does not mark the mandate signed or activate the listing/)

const quickAddListings = fs.readFileSync('src/pages/AgentListings.jsx', 'utf8')
const quickAddQueue = quickAddListings.slice(
  quickAddListings.indexOf('function buildQuickAddDocumentUploadQueue'),
  quickAddListings.indexOf('function getMergedQuickListingStatus'),
)
assert.match(quickAddQueue, /kind: 'mandate_evidence'/)
assert.match(quickAddQueue, /documentType: 'manual_mandate_evidence'/)
assert.match(quickAddQueue, /documentCategory: 'Mandate evidence'/)
assert.doesNotMatch(quickAddQueue, /kind: 'mandate'/)
const quickAddSave = quickAddListings.slice(
  quickAddListings.indexOf('async function performSaveListing'),
  quickAddListings.indexOf("let onboardingLink = ''"),
)
assert.doesNotMatch(quickAddSave, /mandateStatus = 'signed_uploaded'/)
assert.doesNotMatch(quickAddSave, /listingStatus = 'active'/)
assert.match(quickAddSave, /activatedAt: null/)
assert.match(quickAddListings, /function resolveQuickListingStatus\(form\)[\s\S]{0,420}\['active', 'mandate_signed', 'under_offer', 'transaction_created', 'sold'\].includes\(normalized\)\) return 'listing_review'/)
assert.match(quickAddListings, /function hasCanonicalFinalMandatePacket/)
assert.match(quickAddListings, /documentType \|\| document\?\.document_type\) === 'manual_mandate_evidence'/)
const quickAddActivationTier = quickAddListings.slice(
  quickAddListings.indexOf('function getQuickListingActivationTier'),
  quickAddListings.indexOf('function resolveQuickListingStatus'),
)
assert.doesNotMatch(quickAddActivationTier, /fully_compliant_active/)
assert.doesNotMatch(quickAddActivationTier, /signed_uploaded/)

const lifecycle = fs.readFileSync('src/lib/privateListingLifecycle.js', 'utf8')
assert.match(lifecycle, /function hasCanonicalFinalMandatePacket/)
assert.match(lifecycle, /CANONICAL_MANDATE_COMPLETION_TARGETS = new Set\(\['mandate_signed', 'active'\]\)/)
assert.match(lifecycle, /function getCanonicalMandateCompletionBlocker/)
assert.match(lifecycle, /nonOverridableBlockers/)
assert.doesNotMatch(lifecycle, /listingHasDocumentSignal/)
assert.match(lifecycle, /completed canonical mandate packet with a final signed artifact/)

const privateListingService = fs.readFileSync('src/services/privateListingService.js', 'utf8')
const packetSummary = privateListingService.slice(
  privateListingService.indexOf('const packetSummaryByPacketId = new Map()'),
  privateListingService.indexOf('const result = new Map()', privateListingService.indexOf('const packetSummaryByPacketId = new Map()')),
)
assert.match(packetSummary, /const packetCompleted = \['completed', 'fully_signed', 'finalised', 'finalized'\]\.includes\(packetStatus\)/)
assert.match(packetSummary, /state: packetCompleted && finalSignedFilePath/)
assert.doesNotMatch(packetSummary, /state: finalSignedFilePath/)
assert.match(privateListingService, /nonOverridableBlockers/)

const api = fs.readFileSync('src/lib/api.js', 'utf8')
for (const legacyOtpApi of [
  'sendOtpToClient',
  'fetchClientOtpSigningByToken',
  'submitClientOtpSignature',
  'finalizeSignedOtpWorkflow',
]) {
  const start = api.indexOf(`export async function ${legacyOtpApi}`)
  assert.ok(start >= 0, `${legacyOtpApi} must remain explicitly fail-closed`)
  const body = api.slice(start, start + 700)
  assert.match(body, /throw new Error\(PHASE0_LEGACY_OTP_SIGNING_DISABLED\)/)
}
const otpWorkflowMutation = api.slice(
  api.indexOf('export async function updateOtpDocumentWorkflowState'),
  api.indexOf('export async function finalizeSignedOtpWorkflow'),
)
assert.match(otpWorkflowMutation, /OTP_DOCUMENT_TYPES\.sentToClient/)
assert.match(otpWorkflowMutation, /isClientVisible === true/)

const workspacePage = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')
const sendCallback = workspacePage.slice(
  workspacePage.indexOf('const handleSend = useCallback'),
  workspacePage.indexOf('const handleSignedFinalized = useCallback'),
)
assert.match(sendCallback, /emailConfirmed = [\s\S]{0,160}Boolean\(emailDeliveryId\)/)
assert.ok(
  sendCallback.lastIndexOf('if (!emailConfirmed)') < sendCallback.lastIndexOf('void syncLeadMandateState'),
  'lead sent state must follow provider delivery confirmation',
)
assert.match(sendCallback, /dispatchId: normalizeText\(dispatchId\)/)
assert.doesNotMatch(sendCallback, /updateOtpDocumentWorkflowState/)

const agencyPipeline = fs.readFileSync('src/pages/agency/AgencyPipelinePage.jsx', 'utf8')
const pipelineSend = agencyPipeline.slice(
  agencyPipeline.indexOf('async function handleSendMandateToSeller'),
  agencyPipeline.indexOf('async function handleSelectedLeadMandatePrimaryAction'),
)
assert.match(pipelineSend, /emailConfirmed = [\s\S]{0,160}Boolean\(emailDeliveryId\)/)
assert.ok(
  pipelineSend.lastIndexOf('if (!emailConfirmed)') < pipelineSend.lastIndexOf('await updateAgencyCrmLeadRecord'),
  'pipeline sent state must follow provider delivery confirmation',
)
assert.match(pipelineSend, /let dispatchId = normalizeText\(options\.dispatchId\)/)
assert.match(pipelineSend, /dispatchId = normalizeText\(linkResult\?\.dispatchId\) \|\| dispatchId/)
assert.match(pipelineSend, /dispatchId,/)

const app = fs.readFileSync('src/App.jsx', 'utf8')
assert.match(app, /path="\/client\/:token\/otp-signing"[\s\S]{0,300}<LegacyOtpSigningRedirect/)
assert.doesNotMatch(app, /<SignerPortal sessionSource="legacy-otp"/)

const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
for (const forbidden of ['legacyOtpMode', 'fetchClientOtpSigningByToken', 'submitClientOtpSignature', 'sessionSource']) {
  assert.doesNotMatch(portal, new RegExp(forbidden))
}

console.log('document generator Phase 0 frontend containment: passed')
