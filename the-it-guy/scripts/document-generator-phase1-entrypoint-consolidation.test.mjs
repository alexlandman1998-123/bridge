import assert from 'node:assert/strict'
import fs from 'node:fs'

const pipeline = fs.readFileSync('src/pages/Pipeline.jsx', 'utf8')
const workspacePage = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const signingEmailSender = fs.readFileSync('../supabase/functions/send-mandate-signing-email/index.ts', 'utf8')

assert.doesNotMatch(pipeline, /DocumentPacketWorkflowPanel/)
assert.doesNotMatch(pipeline, /handleSendMandateToSeller/)
assert.doesNotMatch(pipeline, /seller_mandate_sent/)
assert.doesNotMatch(pipeline, /invokeEdgeFunction\('send-email'/)
assert.doesNotMatch(pipeline, /\/settings\/signing-templates/)
assert.match(pipeline, /function resolveCanonicalMandatePacketId\(lead = null\)/)
assert.match(pipeline, /function resolveCanonicalMandateLeadId\(lead = null\)/)
assert.match(pipeline, /function resolveCanonicalMandateWorkspacePath\(lead = null\)/)
assert.match(pipeline, /\/pipeline\/leads\/\$\{encodeURIComponent\(canonicalLeadId\)\}\/legal\/mandate\?mode=generate&sourceMode=saved&documentStart=seller_lead_mandate/)
assert.match(pipeline, /Canonical document workspace unavailable/)
assert.match(pipeline, /Document generation and delivery remain unavailable until it is migrated into Agency Pipeline\./)

const legacyHandoffStart = pipeline.indexOf('function handleOpenCanonicalMandateWorkspace()')
const legacyHandoffEnd = pipeline.indexOf('\n  function submitViewingFromLead()', legacyHandoffStart)
assert.ok(legacyHandoffStart >= 0 && legacyHandoffEnd > legacyHandoffStart, 'Legacy handoff must remain isolated from the old sender.')
const legacyHandoff = pipeline.slice(legacyHandoffStart, legacyHandoffEnd)
assert.match(legacyHandoff, /const workspacePath = resolveCanonicalMandateWorkspacePath\(selectedMandateLead\)/)
assert.match(legacyHandoff, /navigate\(workspacePath\)/)
assert.doesNotMatch(legacyHandoff, /updateListingDraft|updateAgentSellerLead|invokeEdgeFunction|send-email|mandateStatus/)

assert.match(
  app,
  /path="\/pipeline\/leads\/:leadId\/legal\/:packetType"[\s\S]{0,280}?<RoleRoute allowedRoles=\{\['developer', 'agent'\]\}>/,
)

const handleSendStart = workspacePage.indexOf('const handleSend = useCallback')
const handleSendEnd = workspacePage.indexOf('const handleSignedFinalized', handleSendStart)
assert.ok(handleSendStart >= 0 && handleSendEnd > handleSendStart, 'Workspace send handler must be present.')
const handleSend = workspacePage.slice(handleSendStart, handleSendEnd)

// Phase 2 re-enables OTP delivery only after the current packet version has
// passed the canonical PDF seals. The browser supplies neither a lifecycle
// transition nor an authority substitute: it asks the server to deliver one
// signer-bound E4 dispatch and accepts only its attested response.
assert.match(handleSend, /if \(packetType === 'otp'\) \{[\s\S]{0,280}?getCanonicalOtpSigningReadiness\(canonicalStatus\)/)
assert.match(handleSend, /OTP_SIGNING_PDF_NOT_CERTIFIED/)
assert.match(handleSend, /OTP_SIGNING_PACKET_VERSION_STALE/)
assert.match(handleSend, /OTP_SIGNING_DISPATCH_REQUIRED/)
assert.match(handleSend, /OTP_SIGNING_LINK_REQUIRED/)
assert.match(handleSend, /invokeEdgeFunction\('send-mandate-signing-email',[\s\S]{0,1000}type: 'otp_signing'/)
assert.match(handleSend, /packetVersionId: canonicalVersionId/)
assert.match(handleSend, /dispatchId: canonicalDispatchId/)
assert.match(handleSend, /phase2-otp-signing-delivery-v1/)
assert.match(handleSend, /delivery\?\.recorded === true/)
assert.doesNotMatch(handleSend, /SIGNING_DELIVERY_DISABLED/)

assert.match(workspacePage, /function getCanonicalOtpSigningReadiness\(status = null\)/)
for (const marker of [
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
  "renderedMediaType === 'application/pdf'",
  "const signingDeliveryEnabled = packetType !== 'otp' || otpSigningReadiness.ready",
]) {
  assert.ok(workspacePage.includes(marker), `OTP delivery readiness must require ${marker}`)
}
assert.doesNotMatch(workspacePage, /OTP signing delivery is paused until the server can finalise the exact reviewed PDF\./)

const otpDispatchStart = workspace.indexOf('// OTP delivery is a signer-specific server transaction.')
const otpDispatchEnd = workspace.indexOf('\n    const currentAgentSigner', otpDispatchStart)
assert.ok(otpDispatchStart >= 0 && otpDispatchEnd > otpDispatchStart, 'OTP signer-specific dispatch must be present.')
const otpDispatch = workspace.slice(otpDispatchStart, otpDispatchEnd)
for (const marker of [
  'ensureSignerReadinessBeforeSend',
  'OTP_SIGNING_DISPATCH_NOT_TARGETED',
  'OTP_SIGNING_DISPATCH_NOT_UNIQUE',
  'targetSignerRole: stagedDispatch.signerRole',
  'hasConfirmedOtpSigningDelivery',
  'refreshWorkspaceData({ force: true })',
]) {
  assert.ok(otpDispatch.includes(marker), `OTP signer-specific dispatch must contain ${marker}`)
}
assert.doesNotMatch(otpDispatch, /transitionLifecycleState/)

assert.match(signingEmailSender, /\["seller_mandate_sent", "seller_mandate", "otp_signing"\]/)
assert.match(signingEmailSender, /if \(isOtpSigning && \(!requestedPacketVersionId \|\| !dispatchId\)\)/)
assert.match(signingEmailSender, /OTP_EMAIL_PACKET_NOT_DELIVERABLE/)
assert.match(signingEmailSender, /const deliveryRpc = isOtpSigning\s*\?\s*"bridge_record_otp_signing_delivery_phase2"/)

const autoFinalizationStart = workspace.indexOf('const runAutoFinalize = async () =>')
const autoFinalizationEnd = workspace.indexOf('\n    return () =>', autoFinalizationStart)
assert.ok(autoFinalizationStart >= 0 && autoFinalizationEnd > autoFinalizationStart, 'Automatic finalisation handler must be present.')
const autoFinalization = workspace.slice(autoFinalizationStart, autoFinalizationEnd)
assert.match(autoFinalization, /generateFinalSignedPacketDocument/)
assert.doesNotMatch(autoFinalization, /transitionDocumentPacketLifecycle/)

const manualFinalizationStart = workspace.indexOf('async function handleFinalizeSignedRecord')
const manualFinalizationEnd = workspace.indexOf('\n  async function saveEditableDraftVersion', manualFinalizationStart)
assert.ok(manualFinalizationStart >= 0 && manualFinalizationEnd > manualFinalizationStart, 'Manual finalisation handler must be present.')
const manualFinalization = workspace.slice(manualFinalizationStart, manualFinalizationEnd)
assert.match(manualFinalization, /generateFinalSignedPacketDocument/)
assert.doesNotMatch(manualFinalization, /transitionDocumentPacketLifecycle/)

console.log('Document generator Phase 1 entrypoint-consolidation contract passed.')
