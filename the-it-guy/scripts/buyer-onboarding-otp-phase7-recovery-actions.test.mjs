import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const summaryHelperStart = source.indexOf('function buildBuyerOtpHandoffSummary')
const summaryHelperEnd = source.indexOf('function getKingstonsSellerPackState', summaryHelperStart)
assert.ok(summaryHelperStart > -1 && summaryHelperEnd > summaryHelperStart, 'Buyer OTP handoff summary helper should be sliceable.')
const summaryHelperBlock = source.slice(summaryHelperStart, summaryHelperEnd)

assert.match(summaryHelperBlock, /actionKey: instructionWarning \? 'retry_transfer_instruction' : ''/, 'Transfer instruction warnings should expose a retry action.')
assert.match(summaryHelperBlock, /actionKey: portalWarning \? 'retry_buyer_portal_link' : ''/, 'Buyer portal warnings should expose a retry action.')
assert.match(summaryHelperBlock, /actionLabel: portalWarning \? 'Retry send' : ''/, 'Buyer portal warning action should be clearly labelled.')

assert.match(source, /const \[buyerOtpPortalRetrying, setBuyerOtpPortalRetrying\] = useState\(false\)/, 'Phase 7 should track buyer portal retry state.')

const completeTaskStart = source.indexOf('async function completeBuyerOtpHandoffFollowUpTask')
const completeTaskEnd = source.indexOf('async function completeBuyerViewingAutomationTask', completeTaskStart)
assert.ok(completeTaskStart > -1 && completeTaskEnd > completeTaskStart, 'Buyer OTP follow-up task completion helper should be sliceable.')
const completeTaskBlock = source.slice(completeTaskStart, completeTaskEnd)

assert.match(completeTaskBlock, /selectedLeadTasks\.find/, 'Phase 7 should find the matching open follow-up task before completing it.')
assert.match(completeTaskBlock, /updateAgencyCrmLeadTask/, 'Phase 7 should complete follow-up tasks through the existing task API.')
assert.match(completeTaskBlock, /status: 'Completed'/, 'Phase 7 should mark recovered follow-up tasks complete.')

const retryStart = source.indexOf('async function retryBuyerOtpPortalHandoff')
const retryEnd = source.indexOf('function handleBuyerOtpHandoffSummaryAction', retryStart)
assert.ok(retryStart > -1 && retryEnd > retryStart, 'Buyer portal retry handler should be sliceable.')
const retryBlock = source.slice(retryStart, retryEnd)

assert.match(retryBlock, /sendBuyerPortalLinkAfterOtpUpload/, 'Retry should reuse the canonical buyer portal handoff sender.')
assert.match(retryBlock, /buyerOtpPortalHandoff = \{/, 'Retry should persist an updated buyer portal handoff result.')
assert.match(retryBlock, /updateAgencyCrmLeadRecord/, 'Retry should save the updated handoff payload to the lead.')
assert.match(retryBlock, /activityType: 'Buyer Portal Link Sent'/, 'Successful retry should record a buyer portal link activity.')
assert.match(retryBlock, /completeBuyerOtpHandoffFollowUpTask\(BUYER_OTP_PORTAL_HANDOFF_FOLLOW_UP_TASK_TITLE\)/, 'Successful retry should complete the queued portal follow-up task.')
assert.match(retryBlock, /Buyer portal handoff still needs attention/, 'Failed retry should keep the handoff visible as needing attention.')

const actionHandlerStart = source.indexOf('function handleBuyerOtpHandoffSummaryAction')
const actionHandlerEnd = source.indexOf('function openBuyerOtpUploadPicker', actionHandlerStart)
assert.ok(actionHandlerStart > -1 && actionHandlerEnd > actionHandlerStart, 'Handoff summary action handler should be sliceable.')
const actionHandlerBlock = source.slice(actionHandlerStart, actionHandlerEnd)

assert.match(actionHandlerBlock, /retry_buyer_portal_link[\s\S]*retryBuyerOtpPortalHandoff/, 'Summary action handler should route portal retry actions.')
assert.match(actionHandlerBlock, /open_onboarding_otp[\s\S]*setLeadWorkspaceTab\(BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY\)/, 'Summary action handler should reopen Onboarding / OTP for review actions.')

assert.match(source, /onClick=\{\(\) => handleBuyerOtpHandoffSummaryAction\(item\)\}/, 'Handoff summary panels should wire action buttons to the handler.')
assert.match(source, /buyerOtpPortalRetrying && item\.actionKey === 'retry_buyer_portal_link'/, 'Retry buttons should show busy state only for portal retry actions.')

console.log('Buyer Onboarding / OTP Phase 7 recovery actions contract passed.')
