import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase7Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase7-release-readiness.md'), 'utf8')
const decisionTemplate = JSON.parse(readFileSync(resolve(appRoot, 'docs/seller-process-phase7-release-decision.template.json'), 'utf8'))

const CONTRACT = 'seller-process-global-qa-phase7-release-readiness-v1'
const PHASE6_CONTRACT = 'seller-process-global-qa-phase6-staging-evidence-v1'
const CONFIRMATION = 'GLOBAL_SELLER_QA_PHASE7_RELEASE_READY'
const MAX_DECISION_AGE_HOURS = Number(process.env.SELLER_PROCESS_GLOBAL_QA_MAX_DECISION_AGE_HOURS || 12)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const REQUIRED_SAFEGUARDS = Object.freeze([
  'phase5ReRunPassed',
  'phase6EvidenceAccepted',
  'globalProcessOnly',
  'kingstonsExcluded',
  'noProfileAutodetection',
  'conditionalDocumentsVerified',
  'noLiveMutationFromGate',
  'evidenceRedacted',
  'supportBriefed',
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
    const lastPath = path.at(-1)
    const timestampField = lastPath === 'decidedAt' || lastPath === 'collectedAt'
    assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text), false, `Decision must not contain email-like values at ${location}`)
    assert.equal(/https?:\/\//i.test(text), false, `Decision must not contain URLs at ${location}`)
    assert.equal(/\b(?:bearer|jwt|password|secret|signed url)\b/i.test(text), false, `Decision must not contain credential material at ${location}`)
    if (!timestampField) {
      assert.equal(/(?:\+?\d[\d .()/-]{7,}\d)/.test(text), false, `Decision must not contain phone-like values at ${location}`)
    }
    assert.equal(/seller[-_ ]?portal[-_ ]?token/i.test(text), false, `Decision must not contain seller portal token material at ${location}`)
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
  const timestamp = Date.parse(value)
  assert.ok(Number.isFinite(timestamp), `${label} must be a valid ISO timestamp`)
  return timestamp
}

function assertPhase6EvidenceMatchesDecision(phase6Evidence, decision) {
  assert.equal(phase6Evidence.contract, PHASE6_CONTRACT, 'Phase 7 requires accepted Phase 6 evidence')
  assert.equal(decision.phase6Evidence.contract, PHASE6_CONTRACT)
  assert.equal(decision.phase6Evidence.projectRef, phase6Evidence.projectRef, 'Decision projectRef must match Phase 6 evidence')
  assert.equal(decision.phase6Evidence.collectedAt, phase6Evidence.collectedAt, 'Decision collectedAt must match Phase 6 evidence')
  assert.equal(decision.environment, phase6Evidence.environment, 'Decision environment must match Phase 6 evidence')
  assert.equal(decision.projectRef, phase6Evidence.projectRef, 'Decision projectRef must match the evidence project')
  assert.equal(decision.releaseSource.commitSha, phase6Evidence.releaseSource.commitSha, 'Decision source ref must match Phase 6 evidence')
  assert.equal(decision.releaseSource.phase5Command, phase6Evidence.releaseSource.phase5Command)
  assert.equal(phase6Evidence.releaseSource.phase5Passed, true)
  assert.equal(phase6Evidence.releaseSource.buildPassed, true)
  assert.equal(phase6Evidence.testLead.globalProfileConfirmed, true)
  assert.equal(phase6Evidence.testLead.kingstonsProfileVisible, false)
}

function assertDecisionShape(decision = {}, { template = false, phase6Evidence = null } = {}) {
  assert.equal(decision.contract, CONTRACT)
  const decidedAt = assertDate(decision.decidedAt, 'Decision decidedAt', { template })
  assert.ok(['staging', 'production_shadow'].includes(normalizeText(decision.environment)), 'Decision environment must be staging or production_shadow')
  assertSafeReference(decision.projectRef, 'Decision projectRef', { template })
  assert.equal(decision.operator?.confirmation, CONFIRMATION, 'Decision needs the exact Phase 7 confirmation phrase')
  assertSafeReference(decision.operator?.reference, 'Decision operator reference', { template })

  assert.equal(decision.phase6Evidence?.contract, PHASE6_CONTRACT)
  assertSafeReference(decision.phase6Evidence?.evidenceRef, 'Phase 6 evidence reference', { template })
  assertSafeReference(decision.phase6Evidence?.projectRef, 'Phase 6 project reference', { template })
  assertDate(decision.phase6Evidence?.collectedAt, 'Phase 6 evidence collectedAt', { template })

  assert.equal(decision.releaseSource?.phase5Command, 'npm run test:seller-process-global-qa-phase5')
  assert.equal(typeof decision.releaseSource?.phase5Passed, 'boolean')
  assert.equal(typeof decision.releaseSource?.buildPassed, 'boolean')
  assertSafeReference(decision.releaseSource?.commitSha, 'Decision source reference', { template })

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
  assertSafeReference(decision.approvals?.supportOwnerRef, 'Support owner reference', { template })

  if (!template) {
    assert.equal(decision.releaseDecision.status, 'go', 'Phase 7 release gate only passes a go decision')
    assert.equal(decision.releaseSource.phase5Passed, true, 'Phase 5 rerun must pass for Phase 7')
    assert.equal(decision.releaseSource.buildPassed, true, 'Build must pass for Phase 7')
    for (const key of REQUIRED_SAFEGUARDS) {
      assert.equal(safeguards[key], true, `Phase 7 safeguard is not accepted: ${key}`)
    }
    assert.equal(decision.rollback.validated, true, 'Rollback plan must be validated before go')
    assert.notEqual(decision.approvals.qaOwnerRef, decision.approvals.releaseOwnerRef, 'QA and release owner references must be separate')

    const ageHours = Math.abs(Date.now() - decidedAt) / 36e5
    assert.ok(
      ageHours <= MAX_DECISION_AGE_HOURS || process.env.SELLER_PROCESS_GLOBAL_QA_ALLOW_STALE_DECISION === 'true',
      `Release decision is stale: ${ageHours.toFixed(1)}h old`,
    )
    const expectedProjectRef = normalizeText(process.env.SELLER_PROCESS_GLOBAL_QA_EXPECTED_PROJECT_REF)
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
  packageJson.scripts?.['test:seller-process-global-qa-phase7'],
  'node scripts/seller-process-global-qa-phase7.test.mjs',
)
assert.equal(
  packageJson.scripts?.['verify:seller-process-global-qa:release'],
  'npm run test:seller-process-global-qa-phase5 && node scripts/seller-process-global-qa-phase7.test.mjs --require-release',
)

for (const [label, pattern] of [
  ['go/no-go', /go\/no-go/i],
  ['no deployment', /does not deploy/i],
  ['no onboarding send', /does not send onboarding links/i],
  ['no mandate signature send', /does not send\s+mandate signature requests/i],
  ['profile separation', /global and Kingstons stay separated/i],
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
  console.log('seller process global QA Phase 7 contract passed (release validation skipped)')
} else {
  assert.ok(phase6EvidencePath, 'Phase 7 requires --phase6-evidence=<redacted-evidence.json>')
  assert.ok(decisionPath, 'Phase 7 requires --decision=<redacted-decision.json>')

  const phase6Result = spawnSync(npmCommand, ['run', 'test:seller-process-global-qa-phase6', '--silent', '--', `--evidence=${phase6EvidencePath}`], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  })
  assert.equal(phase6Result.status, 0, 'Phase 6 evidence did not pass validation')

  const phase6Evidence = JSON.parse(readFileSync(resolve(process.cwd(), phase6EvidencePath), 'utf8'))
  const decision = JSON.parse(readFileSync(resolve(process.cwd(), decisionPath), 'utf8'))
  assertDecisionShape(decision, { phase6Evidence })
  console.log('seller process global QA Phase 7 release readiness passed')
}
