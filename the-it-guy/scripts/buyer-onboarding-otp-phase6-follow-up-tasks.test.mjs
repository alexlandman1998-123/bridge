import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(source, /BUYER_OTP_TRANSFER_INSTRUCTION_FOLLOW_UP_TASK_TITLE = 'Review OTP transfer instruction'/, 'Phase 6 should define a stable transfer-instruction follow-up task title.')
assert.match(source, /BUYER_OTP_PORTAL_HANDOFF_FOLLOW_UP_TASK_TITLE = 'Send buyer portal link'/, 'Phase 6 should define a stable buyer-portal follow-up task title.')

const taskHelperStart = source.indexOf('async function createBuyerOtpHandoffFollowUpTask')
const taskHelperEnd = source.indexOf('async function completeBuyerViewingAutomationTask', taskHelperStart)
assert.ok(taskHelperStart > -1 && taskHelperEnd > taskHelperStart, 'Buyer OTP handoff follow-up task helper should be sliceable.')
const taskHelperBlock = source.slice(taskHelperStart, taskHelperEnd)

assert.match(taskHelperBlock, /createAgencyCrmLeadTask/, 'Phase 6 helper should create CRM tasks through the existing lead task API.')
assert.match(taskHelperBlock, /selectedLeadTasks\.find/, 'Phase 6 helper should dedupe against existing open lead tasks.')
assert.match(taskHelperBlock, /status: 'Pending'/, 'Phase 6 follow-up tasks should be pending by default.')
assert.match(taskHelperBlock, /priority/, 'Phase 6 follow-up tasks should preserve a priority.')

const uploadHandlerStart = source.indexOf('async function handleUploadBuyerOfferDocument')
const uploadHandlerEnd = source.indexOf('function openSelectedLeadOtpEditor', uploadHandlerStart)
assert.ok(uploadHandlerStart > -1 && uploadHandlerEnd > uploadHandlerStart, 'OTP upload handler should be sliceable.')
const uploadHandlerBlock = source.slice(uploadHandlerStart, uploadHandlerEnd)

assert.match(uploadHandlerBlock, /buyerOtpHandoffFollowUpTaskCount = 0/, 'OTP upload should track queued follow-up tasks.')
assert.match(uploadHandlerBlock, /if \(attorneyInstructionWarning\) \{[\s\S]*BUYER_OTP_TRANSFER_INSTRUCTION_FOLLOW_UP_TASK_TITLE/, 'Transfer instruction warnings should queue a follow-up task.')
assert.match(uploadHandlerBlock, /if \(buyerPortalHandoffWarning\) \{[\s\S]*BUYER_OTP_PORTAL_HANDOFF_FOLLOW_UP_TASK_TITLE/, 'Buyer portal handoff warnings should queue a follow-up task.')
assert.match(uploadHandlerBlock, /Promise\.all\(buyerOtpHandoffFollowUpRequests\.map/, 'Follow-up tasks should be created together after OTP activity is recorded.')
assert.match(uploadHandlerBlock, /catch\(\(taskError\) => \{[\s\S]*Buyer OTP handoff follow-up task could not be created/, 'Follow-up task creation should be non-blocking.')
assert.match(uploadHandlerBlock, /A follow-up task was queued\./, 'Warning messages should tell the agent when a follow-up task was queued.')

console.log('Buyer Onboarding / OTP Phase 6 follow-up tasks contract passed.')
