import assert from 'node:assert/strict'
import fs from 'node:fs'

const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const page = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')

assert.match(workspace, /const SIGNING_DELIVERY_TIMEOUT_MS = 12000/)
assert.match(workspace, /sendResult = await withWorkspaceTimeout\(\s*Promise\.resolve\(onSend\(/)
assert.match(workspace, /void completeAppliedEnvelopeDispatch\(/)
assert.doesNotMatch(workspace, /const refreshed = await resolveDocumentPacketStatus\(/)
assert.match(workspace, /scheduleWorkspaceStatusRevalidation\('signing status', SIGNING_STATUS_REVALIDATION_DELAYS_MS\)/)
assert.doesNotMatch(workspace, /void resolveDocumentPacketStatus\(\{\s*packetType,\s*packetId: currentPacketId/)
assert.match(workspace, /background \$\{reason\} revalidation failed/)
assert.match(workspace, /if \(\['send_signature', 'resend_signature', 'remind_signer'\]\.includes\(actionKey\)\)/)
assert.match(workspace, /const sent = await runReviewAction\('send_signature', \{ confirmedSend: true \}\)/)
assert.match(workspace, /if \(sent\) setSendConfirmationOpen\(false\)/)

assert.match(page, /const LEGAL_WORKSPACE_SIGNING_EMAIL_TIMEOUT_MS = 10000/)
assert.match(page, /const status = null\s+const latestVersion = null/)
assert.doesNotMatch(page, /const shouldResolveStatus = packetType === 'otp' \|\| !resend/)
assert.doesNotMatch(page, /const status = shouldResolveStatus \? await resolveCurrentStatus\(\) : null/)
assert.match(page, /const deliveries = await Promise\.all\(recipients\.map\(async \(signer\) => \{/)
assert.match(page, /packetId: normalizeText\(sentPacketId\)/)
assert.match(page, /OTP document workflow sync skipped after signing send/)
assert.match(page, /void \(async \(\) => \{\s*try \{\s*await withLegalWorkspaceTimeout\(\s*updatePrivateListing/)
assert.match(page, /linked listing mandate send sync skipped/)

console.log('Signing send responsiveness contract passed.')
