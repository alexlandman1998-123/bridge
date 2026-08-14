import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(source, /const \[buyerOtpInstructionRetrying, setBuyerOtpInstructionRetrying\] = useState\(false\)/, 'Phase 8 should track transfer-instruction retry state.')

const summaryHelperStart = source.indexOf('function buildBuyerOtpHandoffSummary')
const summaryHelperEnd = source.indexOf('function getKingstonsSellerPackState', summaryHelperStart)
assert.ok(summaryHelperStart > -1 && summaryHelperEnd > summaryHelperStart, 'Buyer OTP handoff summary helper should be sliceable.')
const summaryHelperBlock = source.slice(summaryHelperStart, summaryHelperEnd)

assert.match(summaryHelperBlock, /actionKey: instructionWarning \? 'retry_transfer_instruction' : ''/, 'Transfer instruction warnings should expose a direct retry action.')
assert.match(summaryHelperBlock, /actionLabel: instructionWarning \? 'Retry instruction' : ''/, 'Transfer instruction warning action should be clearly labelled.')

const retryStart = source.indexOf('async function retryBuyerOtpTransferInstruction')
const retryEnd = source.indexOf('function handleBuyerOtpHandoffSummaryAction', retryStart)
assert.ok(retryStart > -1 && retryEnd > retryStart, 'Transfer instruction retry handler should be sliceable.')
const retryBlock = source.slice(retryStart, retryEnd)

assert.match(retryBlock, /syncKingstonsTransferAttorneyPreInstruction/, 'Transfer instruction retry should sync the attorney allocation before instructing.')
assert.match(retryBlock, /instructPrivateListingTransferAttorneyAllocation/, 'Transfer instruction retry should reuse the canonical private-listing instruction action.')
assert.match(retryBlock, /source: 'buyer_otp_handoff_retry'/, 'Transfer instruction retry should be traceable to the handoff summary retry action.')
assert.match(retryBlock, /buyerOtpAttorneyInstruction = \{/, 'Transfer instruction retry should persist the updated attorney instruction payload.')
assert.match(retryBlock, /warning: retryWarning/, 'Transfer instruction retry should keep warnings visible if the retry still needs attention.')
assert.match(retryBlock, /activityType: 'Transfer Instruction Requested'/, 'Successful transfer instruction retry should record an activity.')
assert.match(retryBlock, /completeBuyerOtpHandoffFollowUpTask\(BUYER_OTP_TRANSFER_INSTRUCTION_FOLLOW_UP_TASK_TITLE\)/, 'Successful transfer instruction retry should complete the queued follow-up task.')
assert.match(retryBlock, /Confirm the attorney of record and linked listing before retrying/, 'Transfer instruction retry should fall back to review when listing or attorney context is missing.')

const actionHandlerStart = source.indexOf('function handleBuyerOtpHandoffSummaryAction')
const actionHandlerEnd = source.indexOf('function openBuyerOtpUploadPicker', actionHandlerStart)
assert.ok(actionHandlerStart > -1 && actionHandlerEnd > actionHandlerStart, 'Handoff summary action handler should be sliceable.')
const actionHandlerBlock = source.slice(actionHandlerStart, actionHandlerEnd)

assert.match(actionHandlerBlock, /retry_transfer_instruction[\s\S]*retryBuyerOtpTransferInstruction/, 'Summary action handler should route transfer-instruction retry actions.')
assert.match(source, /buyerOtpInstructionRetrying && item\.actionKey === 'retry_transfer_instruction'/, 'Retry buttons should show busy state for transfer-instruction retry actions.')

console.log('Buyer Onboarding / OTP Phase 8 transfer instruction retry contract passed.')
