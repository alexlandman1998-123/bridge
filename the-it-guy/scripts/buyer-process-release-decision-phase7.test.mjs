import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase7Doc = readFileSync(resolve(appRoot, 'docs/buyer-process-phase7-release-decision.md'), 'utf8')
const decisionTemplate = JSON.parse(readFileSync(resolve(appRoot, 'docs/buyer-process-phase7-release-decision.template.json'), 'utf8'))

const CONTRACT = 'buyer-process-phase7-release-decision-v1'
const PHASE6_CONTRACT = 'buyer-process-phase6-release-readiness-v1'
const CONFIRMATION = 'BUYER_PROCESS_PHASE7_RELEASE_DECISION_CONFIRMED'
const MAX_DECISION_AGE_HOURS = Number(process.env.BUYER_PROCESS_RELEASE_MAX_DECISION_AGE_HOURS || 12)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const REQUIRED_PHASE6_CHECKS = Object.freeze([
  'globalStageOrder',
  'kingstonsStageOrder',
  'noGlobalOtpGeneration',
  'kingstonsManualOtpOnly',
  'signedOtpUploadConfirmations',
  'buyerProfileCaptured',
  'bondOriginatorHandoff',
  'transferAttorneyHandoff',
  'globalBuyerOnboardingLink',
  'kingstonsManualBuyerInstructions',
  'transactionMoveGate',
  'transactionHandoffPanel',
  'convertedTransactionIdPersisted',
  'offerToTransactionMatrix',
])

const REQUIRED_SAFEGUARDS = Object.freeze([
  'phase6EvidenceAccepted',
  'globalStageOrderAccepted',
  'kingstonsStageOrderAccepted',
  'noGlobalOtpGeneration',
  'kingstonsManualOtpOnly',
  'signedOtpConfirmationsAccepted',
  'buyerProfileAccepted',
  'bondOriginatorHandoffAccepted',
  'transferAttorneyHandoffAccepted',
  'buyerPortalInstructionsAccepted',
  'transactionMoveGateAccepted',
  'transactionHandoffAccepted',
  'convertedTransactionIdPersisted',
  'offerToTransactionMatrixAccepted',
  'noLiveMutationFromGate',
  'evidenceRedacted',
  'supportBriefed',
  'rollbackReady',
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

function assertNoPrivateDecisionData(value = {}) {
  walkStrings(value, (text, path) => {
    const location = path.join('.')
    const key = path.at(-1) || ''
    const structuralValue =
      key === 'decidedAt' ||
      key === 'collectedAt' ||
      key === 'globalDiagnosticCommand' ||
      key === 'phase6Command' ||
      key === 'confirmation' ||
      key === 'contract'
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), false, `Decision must not contain email-like values at ${location}`)
    assert.equal(/https?:\/\//i.test(text), false, `Decision must not contain URLs at ${location}`)
    assert.equal(/\b(?:bearer|jwt|password|secret|signed url|credential)\b/i.test(text), false, `Decision must not contain credential material at ${location}`)
    if (!structuralValue) {
      assert.equal(/(?:\+?\d[\d .()/-]{7,}\d)/.test(text), false, `Decision must not contain phone-like values at ${location}`)
    }
    assert.equal(/buyer[-_ ]?portal[-_ ]?token/i.test(text), false, `Decision must not contain buyer portal token material at ${location}`)
    assert.equal(/onboarding[-_ ]?token/i.test(text), false, `Decision must not contain onboarding token material at ${location}`)
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

function assertPhase6EvidenceIsAccepted(phase6Evidence = {}) {
  assert.equal(phase6Evidence.contract, PHASE6_CONTRACT, 'Phase 7 requires accepted Phase 6 buyer process evidence')
  assert.equal(phase6Evidence.releaseSource?.globalDiagnosticCommand, 'npm run test:buyer-process-global-diagnostic')
  assert.equal(phase6Evidence.releaseSource?.buildCommand, 'npm run build')
  assert.equal(phase6Evidence.releaseSource?.globalDiagnosticPassed, true, 'Phase 6 evidence must include a passing global diagnostic')
  assert.equal(phase6Evidence.releaseSource?.buildPassed, true, 'Phase 6 evidence must include a passing production build')
  assert.equal(phase6Evidence.testLeads?.globalProfileConfirmed, true, 'Phase 6 evidence must confirm the global buyer profile')
  assert.equal(phase6Evidence.testLeads?.kingstonsManualOtpProfileConfirmed, true, 'Phase 6 evidence must confirm the Kingstons manual OTP profile')
  assert.equal(phase6Evidence.testLeads?.profilesStayedSeparated, true, 'Phase 6 evidence must confirm profile separation')
  for (const checkKey of REQUIRED_PHASE6_CHECKS) {
    assert.equal(phase6Evidence.checks?.[checkKey]?.passed, true, `Phase 6 evidence check failed: ${checkKey}`)
  }
}

function assertPhase6EvidenceMatchesDecision(phase6Evidence, decision) {
  assertPhase6EvidenceIsAccepted(phase6Evidence)
  assert.equal(decision.phase6Evidence.contract, PHASE6_CONTRACT)
  assert.equal(decision.phase6Evidence.projectRef, phase6Evidence.projectRef, 'Decision projectRef must match Phase 6 evidence')
  assert.equal(decision.phase6Evidence.collectedAt, phase6Evidence.collectedAt, 'Decision collectedAt must match Phase 6 evidence')
  assert.equal(decision.environment, phase6Evidence.environment, 'Decision environment must match Phase 6 evidence')
  assert.equal(decision.projectRef, phase6Evidence.projectRef, 'Decision projectRef must match the evidence project')
  assert.equal(decision.releaseSource.commitSha, phase6Evidence.releaseSource.commitSha, 'Decision source ref must match Phase 6 evidence')
  assert.equal(decision.releaseSource.globalDiagnosticCommand, phase6Evidence.releaseSource.globalDiagnosticCommand)
  assert.equal(decision.releaseSource.globalDiagnosticPassed, true)
  assert.equal(decision.releaseSource.phase6Command, 'npm run verify:buyer-process-release-readiness')
  assert.equal(decision.releaseSource.buildPassed, true)
}

function assertDecisionShape(decision = {}, { template = false, phase6Evidence = null } = {}) {
  assert.equal(decision.contract, CONTRACT)
  const decidedAt = assertDate(decision.decidedAt, 'Decision decidedAt', { template })
  assert.ok(['staging', 'production_shadow'].includes(normalizeText(decision.environment)), 'Decision environment must be staging or production_shadow')
  assertSafeReference(decision.projectRef, 'Decision projectRef', { template })

  assertSafeReference(decision.releaseSource?.commitSha, 'Decision source reference', { template })
  assert.equal(decision.releaseSource?.globalDiagnosticCommand, 'npm run test:buyer-process-global-diagnostic')
  assert.equal(typeof decision.releaseSource?.globalDiagnosticPassed, 'boolean')
  assert.equal(decision.releaseSource?.phase6Command, 'npm run verify:buyer-process-release-readiness')
  assert.equal(typeof decision.releaseSource?.buildPassed, 'boolean')

  assert.equal(decision.phase6Evidence?.contract, PHASE6_CONTRACT)
  assertSafeReference(decision.phase6Evidence?.evidenceRef, 'Phase 6 evidence reference', { template })
  assertSafeReference(decision.phase6Evidence?.projectRef, 'Phase 6 project reference', { template })
  assertDate(decision.phase6Evidence?.collectedAt, 'Phase 6 evidence collectedAt', { template })

  assert.equal(decision.operator?.confirmation, CONFIRMATION, 'Decision needs the exact Phase 7 confirmation phrase')
  assertSafeReference(decision.operator?.reference, 'Decision operator reference', { template })

  assert.ok(['pending', 'go', 'no_go'].includes(normalizeText(decision.releaseDecision?.status)), 'Decision status must be pending, go, or no_go')
  assertSafeReference(decision.releaseDecision?.decisionRef, 'Decision reference', { template })

  const safeguards = decision.safeguards || {}
  for (const key of REQUIRED_SAFEGUARDS) {
    assert.equal(typeof safeguards[key], 'boolean', `Safeguard ${key} must be a boolean`)
  }

  assertSafeReference(decision.rollback?.ownerRef, 'Rollback owner reference', { template })
  assertSafeReference(decision.rollback?.planRef, 'Rollback plan reference', { template })
  assertSafeReference(decision.rollback?.lastKnownGoodSourceRef, 'Rollback last-known-good source reference', { template })
  assert.equal(typeof decision.rollback?.validated, 'boolean', 'Rollback validated must be a boolean')

  assertSafeReference(decision.approvals?.qaOwnerRef, 'QA owner reference', { template })
  assertSafeReference(decision.approvals?.releaseOwnerRef, 'Release owner reference', { template })
  assertSafeReference(decision.approvals?.operationsOwnerRef, 'Operations owner reference', { template })

  if (!template) {
    assert.equal(decision.releaseDecision.status, 'go', 'Phase 7 release gate only passes a go decision')
    assert.equal(decision.releaseSource.globalDiagnosticPassed, true, 'Global diagnostic must be rerun before the release decision')
    assert.equal(decision.releaseSource.buildPassed, true, 'Build must pass before the release decision')
    for (const key of REQUIRED_SAFEGUARDS) {
      assert.equal(safeguards[key], true, `Phase 7 safeguard is not accepted: ${key}`)
    }
    assert.equal(decision.rollback.validated, true, 'Rollback plan must be validated before go')
    assert.notEqual(decision.approvals.qaOwnerRef, decision.approvals.releaseOwnerRef, 'QA and release owner references must be separate')

    const ageHours = Math.abs(Date.now() - decidedAt) / 36e5
    assert.ok(
      ageHours <= MAX_DECISION_AGE_HOURS || process.env.BUYER_PROCESS_RELEASE_ALLOW_STALE_DECISION === 'true',
      `Release decision is stale: ${ageHours.toFixed(1)}h old`,
    )
    const expectedProjectRef = normalizeText(process.env.BUYER_PROCESS_RELEASE_EXPECTED_PROJECT_REF)
    if (expectedProjectRef) {
      assert.equal(decision.projectRef, expectedProjectRef, 'Decision projectRef does not match expected staging project')
    }
    if (phase6Evidence) {
      assertPhase6EvidenceMatchesDecision(phase6Evidence, decision)
      assert.ok(decidedAt >= Date.parse(phase6Evidence.collectedAt), 'Release decision must not pre-date Phase 6 evidence')
    }
  }

  assertNoPrivateDecisionData(decision)
}

assert.equal(
  packageJson.scripts?.['test:buyer-process-release-decision-phase7'],
  'node scripts/buyer-process-release-decision-phase7.test.mjs',
)
assert.equal(
  packageJson.scripts?.['verify:buyer-process-release-decision'],
  'node scripts/buyer-process-release-decision-phase7.test.mjs --require-release',
)
assert.match(
  packageJson.scripts?.['verify:buyer-process-global-diagnostic'] || '',
  /test:buyer-process-release-decision-phase7/,
  'Global diagnostic verifier should include the local Phase 7 release-decision contract.',
)

for (const [label, pattern] of [
  ['go/no-go', /go\/no-go/i],
  ['no deployment', /does not deploy/i],
  ['no onboarding send', /does not send buyer onboarding links/i],
  ['no OTP mutation', /does not upload OTPs/i],
  ['global and Kingstons separation', /global and Kingstons stay separated/i],
  ['manual Kingstons OTP', /Kingstons manual OTP path/i],
  ['transaction setup', /Transaction Setup/i],
  ['rollback', /rollback/i],
  ['redacted private data', /must not contain emails/i],
]) {
  assert.match(phase7Doc, pattern, `Phase 7 runbook must mention ${label}`)
}

assertDecisionShape(decisionTemplate, { template: true })
for (const key of REQUIRED_SAFEGUARDS) {
  assert.equal(decisionTemplate.safeguards[key], false, `Template safeguard ${key} should start false`)
}
assert.equal(decisionTemplate.releaseDecision.status, 'pending', 'Template decision should start pending')

const phase6EvidencePath = argValue('phase6-evidence') || argValue('evidence')
const decisionPath = argValue('decision')
const requireRelease = process.argv.includes('--require-release')

if (!phase6EvidencePath && !decisionPath) {
  assert.equal(requireRelease, false, 'Phase 7 requires --phase6-evidence=<redacted-evidence.json> and --decision=<redacted-decision.json> when --require-release is set')
  console.log('buyer process Phase 7 release-decision contract passed (release validation skipped)')
} else {
  assert.ok(phase6EvidencePath, 'Phase 7 requires --phase6-evidence=<redacted-evidence.json>')
  assert.ok(decisionPath, 'Phase 7 requires --decision=<redacted-decision.json>')

  const phase6Result = spawnSync(npmCommand, ['run', 'test:buyer-process-release-readiness-phase6', '--silent', '--', `--evidence=${phase6EvidencePath}`], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  })
  assert.equal(phase6Result.status, 0, 'Phase 6 evidence did not pass validation')

  const phase6Evidence = JSON.parse(readFileSync(resolve(process.cwd(), phase6EvidencePath), 'utf8'))
  const decision = JSON.parse(readFileSync(resolve(process.cwd(), decisionPath), 'utf8'))
  assertDecisionShape(decision, { phase6Evidence })
  console.log('buyer process Phase 7 release decision passed')
}
