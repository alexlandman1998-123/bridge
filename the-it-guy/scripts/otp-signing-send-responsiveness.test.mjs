import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const emailHandler = await readFile(new URL('../../supabase/functions/send-email/handlers/sellerMandateSent.ts', import.meta.url), 'utf8')

const handleSendSource = page.match(/const handleSend = useCallback\([\s\S]*?\n  \}, \[actor, leadContext, organisationId, packetType, profile, recordLeadMandateActivity, resolveCurrentStatus, syncLeadMandateState, transactionReference\]\)/)?.[0] || ''
const otpSendBranch = handleSendSource.match(/if \(packetType === 'otp'\) \{[\s\S]*?\n    \}\n    if \(packetType === 'mandate'/)?.[0] || ''

assert.match(otpSendBranch, /const deliveries = await Promise\.all\(/, 'OTP signer emails must be sent concurrently.')
assert.match(otpSendBranch, /packetId: normalizeText\(sentPacketId\)/, 'OTP delivery must use the prepared packet instead of waiting for another status lookup.')
assert.match(otpSendBranch, /recipientRole,/, 'OTP delivery must preserve each signer role.')
assert.match(otpSendBranch, /void \(async \(\) => \{[\s\S]*?updateOtpDocumentWorkflowState/, 'OTP document workflow sync must run after the visible send completes.')
assert.doesNotMatch(otpSendBranch, /await updateOtpDocumentWorkflowState/, 'OTP document workflow sync must not block the send confirmation.')
assert.ok(
  otpSendBranch.indexOf('void (async () => {') < otpSendBranch.indexOf('resolveCurrentStatus(),'),
  'OTP status refresh must run only in the background workflow sync.',
)
assert.match(emailHandler, /const recipientRole = normalizeText\(payload\.recipientRole\)\.toLowerCase\(\) \|\| "signer"/, 'Signing email audit data must retain the real OTP signer role.')
assert.match(emailHandler, /const isAgencyRecipient = recipientRole === "agent"/, 'Email copy must distinguish agency and client recipients without treating purchasers as sellers.')

console.log('OTP signing send responsiveness contract passed')
