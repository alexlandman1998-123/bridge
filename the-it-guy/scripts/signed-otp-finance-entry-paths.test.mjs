import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const lifecycleSource = await readFile(new URL('../src/lib/transactionLifecycleService.js', import.meta.url), 'utf8')

assert.match(apiSource, /resolveWizardInitialTransactionStage\(handoffChecklist/)
assert.match(apiSource, /current_main_stage: resolvedMainStage/)
assert.match(apiSource, /onboarding_status: initialPortalReadinessStatus/)
assert.match(lifecycleSource, /normalized\.includes\('finance'\) \|\| normalized\.includes\('bond'\)\) return 'FIN'/)

const receipt = pipelineSource.slice(pipelineSource.indexOf('async function persistBuyerOtpTransactionSnapshot'), pipelineSource.indexOf('async function persistBuyerOtpTransactionAuditTrail'))
assert.match(pipelineSource, /creationMode: 'signed_otp_capture'/)
assert.match(pipelineSource, /stage: 'OTP Signed'/)
assert.match(pipelineSource, /signed_otp_saved_for_review/)
assert.doesNotMatch(receipt, /(?:onboarding_status|stage|current_main_stage|next_action):/, 'An upload receipt must preserve saved progress until document review releases the downstream workflow.')
assert.match(receipt, /evidenceStatus: 'awaiting_review'/)
console.log('signed OTP entry-path checks passed: canonical review gate precedes Finance; other entry paths retain resolved workflow stages')
