import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase8Doc = readFileSync(resolve(appRoot, 'docs/buyer-process-phase8-controlled-smoke.md'), 'utf8')
const observationTemplate = JSON.parse(readFileSync(resolve(appRoot, 'docs/buyer-process-phase8-controlled-smoke.template.json'), 'utf8'))

const CONTRACT = 'buyer-process-phase8-controlled-smoke-v1'
const PHASE6_CONTRACT = 'buyer-process-phase6-release-readiness-v1'
const PHASE7_CONTRACT = 'buyer-process-phase7-release-decision-v1'
const CONFIRMATION = 'BUYER_PROCESS_PHASE8_CONTROLLED_SMOKE_COMPLETE'
const MAX_OBSERVATION_AGE_HOURS = Number(process.env.BUYER_PROCESS_RELEASE_MAX_OBSERVATION_AGE_HOURS || 6)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const REQUIRED_OBSERVATIONS = Object.freeze([
  'changeWindowApproved',
  'phase7DecisionAccepted',
  'globalTestLeadIsolated',
  'kingstonsTestLeadIsolated',
  'globalOnboardingLinkControlled',
  'globalBuyerOnboardingSubmitted',
  'globalTransactionSetupCompleted',
  'globalSignedOfferUploaded',
  'kingstonsManualOtpUploaded',
  'kingstonsSignedOtpConfirmations',
  'buyerProfileCapturedBeforeTransaction',
  'bondOriginatorHandoffObserved',
  'transferAttorneyHandoffObserved',
  'buyerPortalInstructionsSent',
  'moveToTransactionGateObserved',
  'transactionCreated',
  'buyerProcessHandoffVisible',
  'convertedTransactionIdPersisted',
  'globalOnlyNoKingstonsLeak',
  'kingstonsOnlyNoGlobalOnboardingLeak',
  'rollbackReadyAndUnused',
  'supportMonitoringClear',
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
      key === 'decidedAt' ||
      key === 'collectedAt' ||
      key === 'globalDiagnosticCommand' ||
      key === 'phase6Command' ||
      key === 'phase7Command' ||
      key === 'confirmation' ||
      key === 'contract'
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), false, `Observation must not contain email-like values at ${location}`)
    assert.equal(/https?:\/\//i.test(text), false, `Observation must not contain URLs at ${location}`)
    assert.equal(/\b(?:bearer|jwt|password|secret|credential|signed url)\b/i.test(text), false, `Observation must not contain credential material at ${location}`)
    if (!structuralValue) {
      assert.equal(/(?:\+?\d[\d .()/-]{7,}\d)/.test(text), false, `Observation must not contain phone-like values at ${location}`)
    }
    assert.equal(/buyer[-_ ]?portal[-_ ]?token/i.test(text), false, `Observation must not contain buyer portal token material at ${location}`)
    assert.equal(/onboarding[-_ ]?token/i.test(text), false, `Observation must not contain onboarding token material at ${location}`)
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
  if (template && /^REPLACE_WITH_/.test(text)) {
    return null
  }
  const timestamp = Date.parse(text)
  assert.ok(Number.isFinite(timestamp), `${label} must be a valid ISO timestamp`)
  return timestamp
}

function assertObservationMatchesPriorGates(observation, phase6Evidence, phase7Decision) {
  assert.equal(phase6Evidence.contract, PHASE6_CONTRACT)
  assert.equal(phase7Decision.contract, PHASE7_CONTRACT)
  assert.equal(phase7Decision.releaseDecision.status, 'go', 'Phase 8 requires a Phase 7 go decision')
  assert.equal(observation.phase6Evidence.evidenceRef, phase7Decision.phase6Evidence.evidenceRef, 'Phase 8 must reference the same Phase 6 evidence as Phase 7')
  assert.equal(observation.phase7Decision.decisionRef, phase7Decision.releaseDecision.decisionRef, 'Phase 8 must reference the Phase 7 decision')
  assert.equal(observation.projectRef, phase7Decision.projectRef, 'Phase 8 projectRef must match Phase 7')
  assert.equal(observation.projectRef, phase6Evidence.projectRef, 'Phase 8 projectRef must match Phase 6')
  assert.equal(observation.releaseSource.commitSha, phase7Decision.releaseSource.commitSha, 'Phase 8 source ref must match Phase 7')
  assert.equal(observation.releaseSource.commitSha, phase6Evidence.releaseSource.commitSha, 'Phase 8 source ref must match Phase 6')
  assert.equal(observation.releaseSource.globalDiagnosticCommand, 'npm run test:buyer-process-global-diagnostic')
  assert.equal(observation.releaseSource.phase6Command, 'npm run verify:buyer-process-release-readiness')
  assert.equal(observation.releaseSource.phase7Command, 'npm run verify:buyer-process-release-decision')
  assert.equal(phase6Evidence.testLeads.globalProfileConfirmed, true)
  assert.equal(phase6Evidence.testLeads.kingstonsManualOtpProfileConfirmed, true)
  assert.equal(phase6Evidence.testLeads.profilesStayedSeparated, true)
}

function assertObservationShape(observation = {}, { template = false, phase6Evidence = null, phase7Decision = null } = {}) {
  assert.equal(observation.contract, CONTRACT)
  const observedAt = assertDate(observation.observedAt, 'Observation observedAt', { template })
  assert.ok(['staging', 'production_shadow'].includes(normalizeText(observation.environment)), 'Observation environment must be staging or production_shadow')
  assertSafeReference(observation.projectRef, 'Observation projectRef', { template })
  assert.equal(observation.operator?.confirmation, CONFIRMATION, 'Observation needs the exact Phase 8 confirmation phrase')
  assertSafeReference(observation.operator?.reference, 'Observation operator reference', { template })

  assertSafeReference(observation.releaseSource?.commitSha, 'Observation source reference', { template })
  assert.equal(observation.releaseSource?.globalDiagnosticCommand, 'npm run test:buyer-process-global-diagnostic')
  assert.equal(typeof observation.releaseSource?.globalDiagnosticPassed, 'boolean')
  assert.equal(observation.releaseSource?.phase6Command, 'npm run verify:buyer-process-release-readiness')
  assert.equal(observation.releaseSource?.phase7Command, 'npm run verify:buyer-process-release-decision')
  assert.equal(typeof observation.releaseSource?.buildPassed, 'boolean')

  assert.equal(observation.phase6Evidence?.contract, PHASE6_CONTRACT)
  assertSafeReference(observation.phase6Evidence?.evidenceRef, 'Phase 6 evidence reference', { template })
  assert.equal(observation.phase7Decision?.contract, PHASE7_CONTRACT)
  assertSafeReference(observation.phase7Decision?.decisionRef, 'Phase 7 decision reference', { template })

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

  assert.equal(typeof observation.closeout?.testLeadsArchivedOrMarked, 'boolean', 'Test lead closeout must be a boolean')
  assert.equal(typeof observation.closeout?.supportHandoffComplete, 'boolean', 'Support handoff closeout must be a boolean')
  assert.equal(typeof observation.closeout?.crossProfileRegressionTicketOpened, 'boolean', 'Cross-profile regression ticket flag must be a boolean')

  if (!template) {
    assert.equal(observation.smokeResult.status, 'passed', 'Phase 8 only passes a completed smoke with status passed')
    assert.equal(observation.releaseSource.globalDiagnosticPassed, true, 'Global diagnostic pass must be carried into Phase 8')
    assert.equal(observation.releaseSource.buildPassed, true, 'Build pass must be carried into Phase 8')
    for (const key of REQUIRED_OBSERVATIONS) {
      assert.equal(observed[key], true, `Phase 8 observation is not accepted: ${key}`)
    }
    assert.equal(observation.rollback.validatedBeforeSmoke, true, 'Rollback must be validated before the smoke')
    assert.equal(observation.rollback.activated, false, 'Rollback must not have been activated for a passing smoke')
    assert.equal(observation.closeout.testLeadsArchivedOrMarked, true, 'Controlled test leads must be archived or marked after smoke')
    assert.equal(observation.closeout.supportHandoffComplete, true, 'Support handoff must be complete after smoke')
    assert.equal(observation.closeout.crossProfileRegressionTicketOpened, false, 'No cross-profile regression ticket should be needed for a passing smoke')

    const ageHours = Math.abs(Date.now() - observedAt) / 36e5
    assert.ok(
      ageHours <= MAX_OBSERVATION_AGE_HOURS || process.env.BUYER_PROCESS_RELEASE_ALLOW_STALE_OBSERVATION === 'true',
      `Smoke observation is stale: ${ageHours.toFixed(1)}h old`,
    )
    const expectedProjectRef = normalizeText(process.env.BUYER_PROCESS_RELEASE_EXPECTED_PROJECT_REF)
    if (expectedProjectRef) {
      assert.equal(observation.projectRef, expectedProjectRef, 'Observation projectRef does not match expected project')
    }
    if (phase6Evidence && phase7Decision) {
      assertObservationMatchesPriorGates(observation, phase6Evidence, phase7Decision)
      assert.ok(observedAt >= Date.parse(phase7Decision.decidedAt), 'Phase 8 observation must not pre-date the Phase 7 decision')
    }
  }

  assertNoPrivateObservationData(observation)
}

assert.equal(
  packageJson.scripts?.['test:buyer-process-controlled-smoke-phase8'],
  'node scripts/buyer-process-controlled-smoke-phase8.test.mjs',
)
assert.equal(
  packageJson.scripts?.['verify:buyer-process-controlled-smoke'],
  'node scripts/buyer-process-controlled-smoke-phase8.test.mjs --require-observation',
)
assert.match(
  packageJson.scripts?.['verify:buyer-process-global-diagnostic'] || '',
  /test:buyer-process-controlled-smoke-phase8/,
  'Global diagnostic verifier should include the local Phase 8 controlled-smoke contract.',
)

for (const [label, pattern] of [
  ['controlled smoke', /controlled smoke/i],
  ['no direct onboarding send', /does not itself send buyer onboarding links/i],
  ['no direct OTP upload', /does not itself upload OTPs/i],
  ['global and Kingstons separation', /global and Kingstons stay separated/i],
  ['Transaction Setup', /Transaction Setup/i],
  ['buyer profile', /buyer profile/i],
  ['bond originator', /bond originator/i],
  ['transfer attorney', /transfer attorney/i],
  ['Buyer Process Handoff', /Buyer Process Handoff/i],
  ['rollback', /rollback/i],
  ['redacted private data', /must not contain emails/i],
]) {
  assert.match(phase8Doc, pattern, `Phase 8 runbook must mention ${label}`)
}

assertObservationShape(observationTemplate, { template: true })
for (const key of REQUIRED_OBSERVATIONS) {
  assert.equal(observationTemplate.observations[key], false, `Template observation ${key} should start false`)
}
assert.equal(observationTemplate.smokeResult.status, 'pending', 'Template smoke status should start pending')

const phase6EvidencePath = argValue('phase6-evidence') || argValue('evidence')
const decisionPath = argValue('decision')
const observationPath = argValue('observation')
const requireObservation = process.argv.includes('--require-observation')

if (!phase6EvidencePath && !decisionPath && !observationPath) {
  assert.equal(requireObservation, false, 'Phase 8 requires --phase6-evidence=<redacted-evidence.json>, --decision=<redacted-decision.json>, and --observation=<redacted-observation.json> when --require-observation is set')
  console.log('buyer process Phase 8 controlled-smoke contract passed (observation validation skipped)')
} else {
  assert.ok(phase6EvidencePath, 'Phase 8 requires --phase6-evidence=<redacted-evidence.json>')
  assert.ok(decisionPath, 'Phase 8 requires --decision=<redacted-decision.json>')
  assert.ok(observationPath, 'Phase 8 requires --observation=<redacted-observation.json>')

  const phase7Result = spawnSync(npmCommand, [
    'run',
    'test:buyer-process-release-decision-phase7',
    '--silent',
    '--',
    '--require-release',
    `--phase6-evidence=${phase6EvidencePath}`,
    `--decision=${decisionPath}`,
  ], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  })
  assert.equal(phase7Result.status, 0, 'Phase 7 release decision did not pass validation')

  const phase6Evidence = JSON.parse(readFileSync(resolve(process.cwd(), phase6EvidencePath), 'utf8'))
  const phase7Decision = JSON.parse(readFileSync(resolve(process.cwd(), decisionPath), 'utf8'))
  const observation = JSON.parse(readFileSync(resolve(process.cwd(), observationPath), 'utf8'))
  assertObservationShape(observation, { phase6Evidence, phase7Decision })
  console.log('buyer process Phase 8 controlled smoke passed')
}
