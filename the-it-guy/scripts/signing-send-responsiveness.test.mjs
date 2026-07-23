import assert from 'node:assert/strict'
import fs from 'node:fs'

const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const page = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')

function requireSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker)
  assert.ok(start >= 0, `${label}: start marker is missing.`)
  const end = endMarker ? source.indexOf(endMarker, start) : source.length
  assert.ok(end >= start, `${label}: end marker is missing.`)
  return source.slice(start, end)
}

assert.match(workspace, /const SIGNING_DELIVERY_TIMEOUT_MS = 12000/)
assert.match(workspace, /sendResult = await withWorkspaceTimeout\(\s*Promise\.resolve\(onSend\(/)
assert.doesNotMatch(workspace, /completeAppliedEnvelopeDispatch/)
assert.doesNotMatch(workspace, /transitionLifecycleState\('sent'\)/)
assert.match(workspace, /dispatchId: normalizeText\(linkResult\?\.dispatchId\)/)
assert.match(workspace, /await refreshWorkspaceData\(\{ force: true \}\)/)
assert.doesNotMatch(workspace, /const refreshed = await resolveDocumentPacketStatus\(/)
assert.match(workspace, /scheduleWorkspaceStatusRevalidation\('signing status', SIGNING_STATUS_REVALIDATION_DELAYS_MS\)/)
assert.doesNotMatch(workspace, /void resolveDocumentPacketStatus\(\{\s*packetType,\s*packetId: currentPacketId/)
assert.match(workspace, /background \$\{reason\} revalidation failed/)
assert.match(workspace, /if \(\['send_signature', 'resend_signature', 'remind_signer'\]\.includes\(actionKey\)\)/)
assert.match(workspace, /const sent = await runReviewAction\('send_signature', \{ confirmedSend: true \}\)/)
assert.match(workspace, /if \(sent\) setSendConfirmationOpen\(false\)/)

const otpInitialSend = requireSlice(
  workspace,
  'if (isOtpPacket && !resend) {',
  '    const currentAgentSigner =',
  'OTP initial send',
)

assert.ok(otpInitialSend.includes('const stagedOtpDispatches = []'), 'OTP initial send must stage dispatches before delivery.')
assert.ok(otpInitialSend.includes('const dispatchIds = new Set()'), 'OTP initial send must track dispatch uniqueness.')
assert.ok(otpInitialSend.includes('targetSignerRole: signerRole'), 'Each OTP dispatch must be targeted to one required signer.')
assert.ok(otpInitialSend.includes('if (!dispatchId || dispatchTargetRole !== signerRole)'), 'OTP initial send must reject an untargeted server dispatch.')
assert.ok(otpInitialSend.includes('if (dispatchIds.has(dispatchId))'), 'OTP initial send must reject a reused dispatch ID.')
assert.ok(otpInitialSend.includes('signerLinks: [stagedDispatch.signer]'), 'Each OTP delivery must contain exactly its staged signer link.')
assert.ok(otpInitialSend.includes('targetSignerRole: stagedDispatch.signerRole'), 'Each OTP delivery must retain its signer target.')
assert.ok(otpInitialSend.includes('dispatchId: stagedDispatch.dispatchId'), 'Each OTP delivery must retain its exact E4 dispatch ID.')
assert.ok(
  otpInitialSend.indexOf('for (const signerRole of otpRequiredSignerRoles)') <
    otpInitialSend.indexOf('for (const stagedDispatch of stagedOtpDispatches)'),
  'All OTP signer dispatches must be staged before any provider delivery is attempted.',
)
assert.ok(otpInitialSend.includes('hasConfirmedOtpSigningDelivery(sendResult'), 'OTP delivery must require server-recorded Phase 2 evidence.')
assert.ok(otpInitialSend.includes("scheduleWorkspaceStatusRevalidation('OTP signing status'"), 'OTP delivery must refresh authoritative status after completion.')
assert.doesNotMatch(otpInitialSend, /transitionLifecycleState\(/, 'OTP initial send must not mutate lifecycle in the browser.')
assert.match(workspace, /if \(isOtpPacket && reminder\)[\s\S]{0,300}OTP_REMINDER_DISPATCH_REQUIRED/)
assert.match(workspace, /if \(isOtpPacket && resend && !normalizedTargetSignerRole\)/)

assert.match(page, /const LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS = 10000/)
assert.match(page, /const status = null\s+const latestVersion = null/)
assert.doesNotMatch(page, /const shouldResolveStatus = packetType === 'otp' \|\| !resend/)
assert.doesNotMatch(page, /const status = shouldResolveStatus \? await resolveCurrentStatus\(\) : null/)
assert.doesNotMatch(page, /Promise\.all\(recipients\.map\(async \(signer\)/)
assert.doesNotMatch(page, /OTP document workflow sync skipped after signing send/)
assert.match(page, /dispatchId: normalizeText\(dispatchId\)/)
assert.match(page, /void \(async \(\) => \{\s*try \{\s*await withLegalWorkspaceTimeout\(\s*updatePrivateListing/)
assert.match(page, /linked listing mandate send sync skipped/)

const handleSendStart = page.indexOf('const handleSend = useCallback')
assert.ok(handleSendStart >= 0, 'Workspace page signing sender is missing.')
const otpDelivery = requireSlice(
  page.slice(handleSendStart),
  "if (packetType === 'otp') {",
  "    if (packetType === 'mandate'",
  'OTP page delivery',
)

assert.ok(otpDelivery.includes('const canonicalStatus = await resolveCurrentStatus()'), 'OTP delivery must resolve current canonical packet status.')
assert.ok(otpDelivery.includes('getCanonicalOtpSigningReadiness(canonicalStatus)'), 'OTP delivery must require the certified PDF readiness gate.')
assert.ok(otpDelivery.includes('const canonicalDispatchId = normalizeText(dispatchId)'), 'OTP delivery must require the workspace dispatch ID.')
assert.ok(otpDelivery.includes("error.code = 'OTP_SIGNING_DISPATCH_REQUIRED'"), 'OTP delivery must reject a missing dispatch ID.')
assert.ok(otpDelivery.includes('const activeSigner = signerRows.find'), 'OTP page delivery must select one signer per workspace dispatch.')
assert.ok(otpDelivery.includes("type: 'otp_signing'"), 'OTP delivery must use the canonical OTP sender contract.')
assert.ok(otpDelivery.includes('packetId: canonicalPacketId'), 'OTP delivery must bind to the current canonical packet.')
assert.ok(otpDelivery.includes('packetVersionId: canonicalVersionId'), 'OTP delivery must bind to the current canonical version.')
assert.ok(otpDelivery.includes('dispatchId: canonicalDispatchId'), 'OTP delivery must pass the exact signer dispatch ID.')
assert.ok(otpDelivery.includes('LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS'), 'OTP delivery must retain the provider timeout.')
assert.ok(otpDelivery.includes("normalizeText(delivery?.contract) === 'phase2-otp-signing-delivery-v1'"), 'OTP delivery must require the Phase 2 server-recorded contract.')
assert.ok(otpDelivery.includes('delivery?.recorded === true'), 'OTP delivery must require authoritative delivery evidence.')
assert.doesNotMatch(otpDelivery, /Promise\.all\(/, 'OTP page delivery must not fan out one dispatch to multiple recipients.')
assert.doesNotMatch(otpDelivery, /updateDocumentPacket|transitionDocumentPacketLifecycle/, 'OTP page delivery must not write lifecycle state in the browser.')

console.log('Signing send responsiveness contract passed.')
