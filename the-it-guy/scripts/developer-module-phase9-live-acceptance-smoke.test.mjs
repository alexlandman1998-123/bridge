import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase9Doc = readFileSync(resolve(appRoot, 'docs/developer-module-phase9-live-acceptance-smoke.md'), 'utf8')
const observationTemplate = JSON.parse(readFileSync(resolve(appRoot, 'docs/developer-module-phase9-live-acceptance-smoke.template.json'), 'utf8'))
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')
const unitDetailSource = readFileSync(resolve(appRoot, 'src/pages/UnitDetail.jsx'), 'utf8')
const developmentDetailSource = readFileSync(resolve(appRoot, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const wizardSource = readFileSync(resolve(appRoot, 'src/components/NewTransactionWizard.jsx'), 'utf8')
const workflowActionsSource = readFileSync(resolve(appRoot, 'server/services/workflowActionAvailabilityService.js'), 'utf8')
const lifecycleSource = readFileSync(resolve(appRoot, 'src/core/transactions/transactionLifecycle.js'), 'utf8')

const CONTRACT = 'developer-module-phase9-live-acceptance-smoke-v1'
const CONFIRMATION = 'DEVELOPER_MODULE_PHASE9_LIVE_ACCEPTANCE_COMPLETE'
const MAX_OBSERVATION_AGE_HOURS = Number(process.env.DEVELOPER_MODULE_ACCEPTANCE_MAX_OBSERVATION_AGE_HOURS || 12)

const REQUIRED_OBSERVATIONS = Object.freeze([
  'changeWindowApproved',
  'developerOverviewOpened',
  'controlledDevelopmentTransactionOpened',
  'workspaceClicksNoFullPageRefresh',
  'topMenuContrastOrderChecked',
  'noSellerOnboardingBlocker',
  'buyerOnboardingPrerequisiteVisible',
  'signedOtpManualUploadGateVisible',
  'reservationDepositBeforeOtpWhenEnabled',
  'reservationDepositNotRequiredWhenDisabled',
  'buyerOnboardingLinkControlled',
  'bondOriginatorHandoffObserved',
  'setupWarningsVisibleAndNonBlocking',
  'requiredDocumentsRlsClear',
  'subprocessesRlsClear',
  'statusLinksAndOnboardingRlsClear',
  'financialReconciliationDownloadObserved',
  'handoffReadinessVisible',
  'supportMonitoringClear',
  'rollbackReadyAndUnused',
])

function argValue(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : ''
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function walkStrings(value, visitor, path = []) {
  if (typeof value === 'string') {
    visitor(value, path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visitor, [...path, String(index)]))
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => walkStrings(item, visitor, [...path, key]))
  }
}

function assertNoPrivateObservationData(value = {}) {
  walkStrings(value, (text, path) => {
    const location = path.join('.')
    const key = path.at(-1) || ''
    const structuralValue =
      key === 'observedAt' ||
      key === 'developerModuleCommand' ||
      key === 'confirmation' ||
      key === 'contract'
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), false, `Observation must not contain email-like values at ${location}`)
    assert.equal(/https?:\/\//i.test(text), false, `Observation must not contain URLs at ${location}`)
    assert.equal(/\b(?:bearer|jwt|password|secret|credential|signed url|service_role|access_token)\b/i.test(text), false, `Observation must not contain credential material at ${location}`)
    if (!structuralValue) {
      assert.equal(/(?:\+?\d[\d .()/-]{7,}\d)/.test(text), false, `Observation must not contain phone-like values at ${location}`)
    }
    assert.equal(/buyer[-_ ]?portal[-_ ]?token/i.test(text), false, `Observation must not contain buyer portal token material at ${location}`)
    assert.equal(/onboarding[-_ ]?token/i.test(text), false, `Observation must not contain onboarding token material at ${location}`)
    assert.equal(/client[-_ ]?portal[-_ ]?token/i.test(text), false, `Observation must not contain client portal token material at ${location}`)
  })
}

function assertSafeReference(value, label, { template = false } = {}) {
  const text = normalizeText(value)
  assert.ok(text, `${label} is required`)
  if (!template) {
    assert.equal(/^REPLACE_WITH_/.test(text), false, `${label} still contains a placeholder`)
  }
}

function assertDate(value, label, { template = false } = {}) {
  const text = normalizeText(value)
  if (template && /^REPLACE_WITH_/.test(text)) return null
  const timestamp = Date.parse(text)
  assert.ok(Number.isFinite(timestamp), `${label} must be a valid ISO timestamp`)
  return timestamp
}

function assertObservationShape(observation = {}, { template = false } = {}) {
  assert.equal(observation.contract, CONTRACT)
  const observedAt = assertDate(observation.observedAt, 'Observation observedAt', { template })
  assert.ok(['staging', 'production_shadow'].includes(normalizeText(observation.environment)), 'Observation environment must be staging or production_shadow')
  assertSafeReference(observation.projectRef, 'Observation projectRef', { template })
  assertSafeReference(observation.operator?.reference, 'Observation operator reference', { template })
  assert.equal(observation.operator?.confirmation, CONFIRMATION, 'Observation needs the exact Phase 9 confirmation phrase')

  assertSafeReference(observation.releaseSource?.commitSha, 'Observation source reference', { template })
  assert.equal(observation.releaseSource?.developerModuleCommand, 'npm run verify:developer-module')
  assert.equal(typeof observation.releaseSource?.developerModulePassed, 'boolean')
  assert.equal(typeof observation.releaseSource?.buildPassed, 'boolean')

  assert.ok(['pending', 'passed', 'failed', 'aborted'].includes(normalizeText(observation.smokeResult?.status)), 'Smoke result must be pending, passed, failed, or aborted')
  assertSafeReference(observation.smokeResult?.runRef, 'Smoke run reference', { template })

  const observed = observation.observations || {}
  for (const key of REQUIRED_OBSERVATIONS) {
    assert.equal(typeof observed[key], 'boolean', `Observation ${key} must be a boolean`)
  }

  assertSafeReference(observation.rollback?.ownerRef, 'Rollback owner reference', { template })
  assertSafeReference(observation.rollback?.planRef, 'Rollback plan reference', { template })
  assert.equal(typeof observation.rollback?.validatedBeforeSmoke, 'boolean', 'Rollback pre-smoke validation must be a boolean')
  assert.equal(typeof observation.rollback?.activated, 'boolean', 'Rollback activation must be a boolean')
  assert.equal(typeof observation.closeout?.testTransactionArchivedOrMarked, 'boolean', 'Test transaction closeout must be a boolean')
  assert.equal(typeof observation.closeout?.supportHandoffComplete, 'boolean', 'Support handoff closeout must be a boolean')
  assert.equal(typeof observation.closeout?.regressionTicketOpened, 'boolean', 'Regression ticket flag must be a boolean')

  if (!template) {
    assert.equal(observation.smokeResult.status, 'passed', 'Phase 9 only passes a completed smoke with status passed')
    assert.equal(observation.releaseSource.developerModulePassed, true, 'Developer module verification must pass before Phase 9 is accepted')
    assert.equal(observation.releaseSource.buildPassed, true, 'Build pass must be carried into Phase 9')
    for (const key of REQUIRED_OBSERVATIONS) {
      assert.equal(observed[key], true, `Phase 9 observation is not accepted: ${key}`)
    }
    assert.equal(observation.rollback.validatedBeforeSmoke, true, 'Rollback must be validated before the smoke')
    assert.equal(observation.rollback.activated, false, 'Rollback must not have been activated for a passing smoke')
    assert.equal(observation.closeout.testTransactionArchivedOrMarked, true, 'Controlled transaction must be archived or marked after smoke')
    assert.equal(observation.closeout.supportHandoffComplete, true, 'Support handoff must be complete after smoke')
    assert.equal(observation.closeout.regressionTicketOpened, false, 'No regression ticket should be needed for a passing smoke')

    const ageHours = Math.abs(Date.now() - observedAt) / 36e5
    assert.ok(
      ageHours <= MAX_OBSERVATION_AGE_HOURS || process.env.DEVELOPER_MODULE_ACCEPTANCE_ALLOW_STALE_OBSERVATION === 'true',
      `Smoke observation is stale: ${ageHours.toFixed(1)}h old`,
    )
    const expectedProjectRef = normalizeText(process.env.DEVELOPER_MODULE_ACCEPTANCE_EXPECTED_PROJECT_REF)
    if (expectedProjectRef) {
      assert.equal(observation.projectRef, expectedProjectRef, 'Observation projectRef does not match expected project')
    }
  }

  assertNoPrivateObservationData(observation)
}

assert.equal(
  packageJson.scripts?.['test:developer-module-phase9'],
  'node scripts/developer-module-phase9-live-acceptance-smoke.test.mjs',
)
assert.equal(
  packageJson.scripts?.['verify:developer-module:acceptance'],
  'node scripts/developer-module-phase9-live-acceptance-smoke.test.mjs --require-observation',
)
assert.match(
  packageJson.scripts?.['verify:developer-module'] || '',
  /test:developer-module-phase9/,
  'developer module verification should include the local Phase 9 acceptance contract.',
)

for (const [label, pattern] of [
  ['live acceptance smoke', /live acceptance smoke/i],
  ['no direct onboarding send', /does not itself send buyer onboarding links/i],
  ['no production mutation', /mutate production data/i],
  ['workspace clicks', /workspace clicks did not refresh the page/i],
  ['top menu', /top workspace menu and contrast container order/i],
  ['seller onboarding absence', /no seller onboarding blocker/i],
  ['buyer onboarding', /buyer onboarding/i],
  ['signed OTP manual upload', /signed OTP remained a manual upload gate/i],
  ['reservation deposit', /reservation deposit appeared before OTP/i],
  ['RLS', /RLS/i],
  ['financial reconciliation', /financial reconciliation download/i],
  ['handoff readiness', /handoff readiness status/i],
  ['rollback', /rollback/i],
  ['redacted evidence', /must not contain emails/i],
]) {
  assert.match(phase9Doc, pattern, `Phase 9 runbook must mention ${label}`)
}

assert.match(phase5Source, /test:developer-module-phase9/)
assert.match(phase6Source, /test:developer-module-phase9/)
assert.match(unitDetailSource, /handleSendOnboardingEmail/)
assert.match(unitDetailSource, /recordBuyerOnboardingSent/)
assert.match(unitDetailSource, /window\.dispatchEvent\(new Event\('itg:transaction-updated'\)\)/)
assert.match(developmentDetailSource, /handleDownloadDeveloperFinancialReconciliation/)
assert.match(developmentDetailSource, /Handoff Readiness/)
assert.match(wizardSource, /Setup Needs Attention/)
assert.match(wizardSource, /setupWarnings/)
assert.match(workflowActionsSource, /Seller onboarding is not required for new development transactions\./)
assert.match(lifecycleSource, /reservation_deposit_paid/)

assertObservationShape(observationTemplate, { template: true })
for (const key of REQUIRED_OBSERVATIONS) {
  assert.equal(observationTemplate.observations[key], false, `Template observation ${key} should start false`)
}
assert.equal(observationTemplate.smokeResult.status, 'pending', 'Template smoke status should start pending')

const observationPath = argValue('observation')
const requireObservation = process.argv.includes('--require-observation')

if (!observationPath) {
  assert.equal(requireObservation, false, 'Phase 9 requires --observation=<redacted-observation.json> when --require-observation is set')
  console.log('developer module Phase 9 live-acceptance smoke contract passed (observation validation skipped)')
} else {
  const observation = JSON.parse(readFileSync(resolve(process.cwd(), observationPath), 'utf8'))
  assertObservationShape(observation)
  console.log('developer module Phase 9 live-acceptance smoke observation passed')
}
