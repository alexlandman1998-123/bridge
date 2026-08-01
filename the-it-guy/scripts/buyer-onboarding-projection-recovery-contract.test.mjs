import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

function sourceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle)
  assert.notEqual(start, -1, `expected source marker: ${startNeedle}`)
  const end = endNeedle ? source.indexOf(endNeedle, start + startNeedle.length) : -1
  assert.notEqual(end, -1, `expected source end marker: ${endNeedle}`)
  return source.slice(start, end)
}

const saveOnboardingSource = sourceBetween(
  apiSource,
  'async function upsertClientOnboardingForm',
  'export async function saveClientOnboardingDraft',
)
const markerPayloadSource = sourceBetween(
  apiSource,
  'function buildBuyerOnboardingProjectionFailurePayload',
  'async function recordBuyerOnboardingProjectionFailureMarker',
)
const markerWriterSource = sourceBetween(
  apiSource,
  'async function recordBuyerOnboardingProjectionFailureMarker',
  'const BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES',
)
const repairTargetsSource = sourceBetween(
  apiSource,
  'async function resolveBuyerOnboardingProjectionRepairTargets',
  'function isBuyerOnboardingSubmittedForProjectionRepair',
)
const repairRunnerSource = sourceBetween(
  apiSource,
  'async function runBuyerOnboardingProjectionRepair',
  'export async function replayBuyerOnboardingProjections',
)
const replaySource = sourceBetween(
  apiSource,
  'export async function replayBuyerOnboardingProjections',
  'async function upsertClientPortalOnboardingForm',
)
const repairEventTypesSource = sourceBetween(
  apiSource,
  'const BUYER_ONBOARDING_PROJECTION_REPAIR_EVENT_TYPES = {',
  'const BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS',
)

const projectionContracts = [
  {
    projection: 'required_documents',
    eventType: 'buyer_onboarding_required_documents_projection_failed',
    saveHelper: 'ensureTransactionRequiredDocuments',
    catchName: 'requiredDocumentsError',
    repairHelper: 'ensureTransactionRequiredDocuments',
  },
  {
    projection: 'platform_fee_consent',
    eventType: 'buyer_onboarding_platform_fee_consent_projection_failed',
    saveHelper: 'acceptBuyerPlatformFeeConsent',
    catchName: 'platformFeeConsentError',
    repairHelper: 'acceptBuyerPlatformFeeConsent',
  },
  {
    projection: 'information_sheet',
    eventType: 'buyer_onboarding_information_sheet_projection_failed',
    saveHelper: "document_key', 'information_sheet",
    catchName: 'informationSheetError',
    repairHelper: "document_key', 'information_sheet",
  },
  {
    projection: 'roleplayer',
    eventType: 'buyer_onboarding_roleplayer_projection_failed',
    saveHelper: 'processBuyerAppointedBondOriginatorRequest',
    catchName: 'roleplayerRequestError',
    repairHelper: 'processBuyerAppointedBondOriginatorRequest',
  },
  {
    projection: 'workflow_evidence',
    eventType: 'buyer_onboarding_workflow_evidence_projection_failed',
    saveHelper: 'processWorkflowEvidenceIfPossible',
    catchName: 'workflowEvidenceError',
    repairHelper: 'processWorkflowEvidenceIfPossible',
  },
  {
    projection: 'awaiting_signed_otp',
    eventType: 'buyer_onboarding_awaiting_signed_otp_projection_failed',
    saveHelper: 'markTransactionAwaitingSignedOtp',
    catchName: 'otpProjectionError',
    repairHelper: 'markTransactionAwaitingSignedOtp',
  },
  {
    projection: 'finance_event',
    eventType: 'buyer_onboarding_finance_event_projection_failed',
    saveHelper: 'finance_type_selected',
    catchName: 'financeEventError',
    repairHelper: 'finance_type_selected',
  },
]

assert.equal(
  packageJson.scripts?.['test:buyer-onboarding-projection-recovery'],
  'node scripts/buyer-onboarding-projection-recovery-contract.test.mjs',
  'Phase 4 contract test must be addressable as an npm script',
)

const validationIndex = saveOnboardingSource.indexOf("isPlatformFeeConsentAccepted(formDataForPersistence, 'buyer')")
const snapshotIndex = saveOnboardingSource.indexOf('syncOnboardingTransactionFinanceSnapshot')
assert.ok(validationIndex !== -1, 'buyer platform fee consent validation must be explicit before submit persistence')
assert.ok(snapshotIndex !== -1, 'buyer onboarding submit must persist through the atomic snapshot helper')
assert.ok(
  validationIndex < snapshotIndex,
  'buyer platform fee consent must fail before the atomic snapshot is saved',
)

for (const { saveHelper, eventType, catchName } of projectionContracts) {
  const helperIndex = saveOnboardingSource.indexOf(saveHelper, snapshotIndex)
  assert.ok(helperIndex > snapshotIndex, `${saveHelper} must run only after the durable snapshot save`)
  assert.match(
    saveOnboardingSource,
    new RegExp(`catch\\s*\\(\\s*${catchName}\\s*\\)\\s*\\{[\\s\\S]*eventType:\\s*['"]${eventType}['"]`),
    `${eventType} must be recorded from its best-effort projection catch block`,
  )
  assert.doesNotMatch(
    saveOnboardingSource,
    new RegExp(`throw\\s+${catchName}\\b`),
    `${catchName} must not become a client-facing submit failure after the snapshot is saved`,
  )
}

assert.match(
  saveOnboardingSource,
  /let\s+otpPendingState\s*=\s*\{[\s\S]*awaiting_signed_otp[\s\S]*nextAction:\s*onboardingNextAction/,
  'awaiting-signed-OTP state must have a local fallback if the projection write fails',
)

assert.match(
  markerPayloadSource,
  /source:\s*'buyer_onboarding_projection_recovery_marker'[\s\S]*recoveryRequired:\s*true[\s\S]*retryable:\s*true/,
  'projection failure markers must be recognizable and replayable',
)
assert.match(
  markerPayloadSource,
  /errorCategory:\s*getBuyerOnboardingProjectionErrorCategory\s*\(error\)[\s\S]*errorCode:/,
  'projection failure markers must keep a sanitized error category and code',
)
assert.doesNotMatch(
  markerPayloadSource,
  /\bmessage\s*:/,
  'projection failure marker payloads must not persist raw exception messages',
)
assert.match(
  markerWriterSource,
  /try\s*\{[\s\S]*logTransactionEventIfPossible[\s\S]*\}\s*catch\s*\(\s*markerError\s*\)[\s\S]*return\s+null/,
  'marker recording must be best-effort and must not create a second submit failure',
)

for (const { projection, eventType, repairHelper } of projectionContracts) {
  assert.match(
    repairEventTypesSource,
    new RegExp(`${projection}:\\s*['"]${eventType}['"]`),
    `${projection} must have a recovery marker event type`,
  )
  assert.match(
    repairRunnerSource,
    new RegExp(`projection\\s*===\\s*['"]${projection}['"][\\s\\S]*${repairHelper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `${projection} replay must reuse the same production projection helper or write contract`,
  )
}

assert.match(
  repairTargetsSource,
  /\.from\(\s*['"]transaction_events['"]\s*\)[\s\S]*\.in\(\s*['"]event_type['"]\s*,\s*markerEventTypes\s*\)/,
  'replay target resolution must be able to drive repairs from Phase 2 marker events',
)
assert.match(
  repairTargetsSource,
  /isMissingTableError[\s\S]*isMissingSchemaError[\s\S]*isPermissionDeniedError[\s\S]*return\s+\[\.\.\.BUYER_ONBOARDING_REPAIRABLE_PROJECTIONS\]/,
  'replay target resolution must fall back to a full repair set when marker reads are unavailable',
)
assert.match(
  replaySource,
  /resolveActiveProfileContext\s*\([\s\S]*\['agent', 'agency_admin', 'developer', 'internal_admin', 'admin', 'platform_admin'\]/,
  'projection replay must be restricted to internal operational roles',
)
assert.match(
  replaySource,
  /isBuyerOnboardingSubmittedForProjectionRepair\s*\([\s\S]*Buyer onboarding must be submitted before projections can be replayed/,
  'projection replay must only repair already-submitted buyer onboarding',
)
assert.match(
  repairRunnerSource,
  /const\s+tokenClient\s*=\s*requireOnboardingTokenClient\s*\(\s*onboarding\.token\s*\)[\s\S]*acceptBuyerPlatformFeeConsent\s*\(\s*tokenClient/,
  'platform fee consent replay must stay inside the onboarding-token boundary',
)
assert.doesNotMatch(
  repairRunnerSource,
  /sendBuyerRoleplayerIntroEmailForOnboarding/,
  'projection replay must not resend buyer roleplayer introduction emails',
)
assert.match(
  replaySource,
  /eventType:\s*failedCount\s*\?\s*'buyer_onboarding_projection_replay_failed'\s*:\s*'buyer_onboarding_projection_replay_completed'/,
  'projection replay must record a sanitized completion/failure summary event',
)
assert.doesNotMatch(
  replaySource,
  /results:\s*results\.map[\s\S]*message:/,
  'projection replay summary events must omit raw failure messages',
)

console.log('buyer onboarding projection recovery contract passed')
