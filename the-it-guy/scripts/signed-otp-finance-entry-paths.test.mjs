import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const pipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const lifecycleSource = await readFile(new URL('../src/lib/transactionLifecycleService.js', import.meta.url), 'utf8')

assert.match(apiSource, /resolveWizardInitialTransactionStage\(handoffChecklist/)
assert.match(apiSource, /current_main_stage: resolvedMainStage/)
assert.match(apiSource, /onboarding_status: initialPortalReadinessStatus/)
assert.match(lifecycleSource, /normalized\.includes\('finance'\) \|\| normalized\.includes\('bond'\)\) return 'FIN'/)

assert.match(
  pipelineSource,
  /onboarding_status: 'signed_otp_received',\s*stage: 'Finance In Progress',\s*current_main_stage: 'FIN'/s,
  'Buyer-lead signed OTP upload must persist the transaction in Finance.',
)
assert.match(
  pipelineSource,
  /transactionCreationOverrideReason:[\s\S]*?stage: 'Finance In Progress'/,
  'Buyer-lead conversion must create the signed-OTP transaction directly in Finance.',
)
assert.doesNotMatch(
  pipelineSource.slice(
    pipelineSource.indexOf('async function persistBuyerOtpTransactionSnapshot'),
    pipelineSource.indexOf('async function persistBuyerOtpTransactionAuditTrail'),
  ),
  /current_main_stage: 'OTP'/,
  'The buyer-lead OTP snapshot must not leave the transaction in OTP.',
)

console.log('signed OTP finance entry-path checks passed')
