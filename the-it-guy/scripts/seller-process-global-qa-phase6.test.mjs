import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase6Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase6-staging-evidence.md'), 'utf8')
const evidenceTemplate = JSON.parse(readFileSync(resolve(appRoot, 'docs/seller-process-phase6-staging-evidence.template.json'), 'utf8'))

const CONTRACT = 'seller-process-global-qa-phase6-staging-evidence-v1'
const REQUIRED_CHECKS = Object.freeze([
  'sendOnboardingLink',
  'sellerOnboardingSubmitted',
  'sellerOnboardingNotificationSent',
  'conditionalDocumentsOff',
  'conditionalDocumentsOn',
  'generateMandate',
  'sendMandate',
  'signMandate',
  'listingCreated',
  'documentTabPopulated',
  'agentUploadOnBehalf',
  'sellerPortalDocumentCenter',
  'noKingstonsLeak',
])
const MAX_EVIDENCE_AGE_HOURS = Number(process.env.SELLER_PROCESS_GLOBAL_QA_MAX_EVIDENCE_AGE_HOURS || 36)

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

function assertNoPrivateEvidence(value = {}) {
  walkStrings(value, (text, path) => {
    const location = path.join('.')
    assert.equal(/@[^\s.]+\.[^\s]+/.test(text), false, `Evidence must not contain email-like values at ${location}`)
    assert.equal(/https?:\/\/[^\s]+token=/i.test(text), false, `Evidence must not contain signed URLs or tokenised links at ${location}`)
    assert.equal(/seller[-_ ]?portal[-_ ]?token/i.test(text), false, `Evidence must not contain seller portal token material at ${location}`)
    assert.equal(/onboarding[-_ ]?token/i.test(text), false, `Evidence must not contain onboarding token material at ${location}`)
  })
}

function assertEvidenceShape(evidence = {}, { template = false } = {}) {
  assert.equal(evidence.contract, CONTRACT)
  assert.ok(normalizeText(evidence.collectedAt), 'Evidence needs collectedAt')
  assert.ok(['staging', 'production_shadow'].includes(normalizeText(evidence.environment)), 'Evidence environment must be staging or production_shadow')
  assert.ok(normalizeText(evidence.projectRef), 'Evidence needs a safe projectRef')
  assert.equal(evidence.releaseSource?.phase5Command, 'npm run test:seller-process-global-qa-phase5')
  assert.equal(typeof evidence.releaseSource?.phase5Passed, 'boolean')
  assert.equal(typeof evidence.releaseSource?.buildPassed, 'boolean')
  assert.ok(normalizeText(evidence.operator?.reference), 'Evidence needs an opaque operator reference')
  assert.equal(
    normalizeText(evidence.operator?.confirmation),
    'GLOBAL_SELLER_QA_PHASE6_REDACTED_EVIDENCE',
    'Evidence needs the exact operator confirmation phrase',
  )

  const checks = evidence.checks || {}
  for (const checkKey of REQUIRED_CHECKS) {
    assert.equal(typeof checks[checkKey]?.passed, 'boolean', `Evidence check ${checkKey} needs a boolean passed value`)
    assert.ok(normalizeText(checks[checkKey]?.evidenceRef), `Evidence check ${checkKey} needs a redacted evidenceRef`)
  }

  if (!template) {
    assert.equal(evidence.releaseSource.phase5Passed, true, 'Phase 5 must pass before Phase 6 evidence is accepted')
    assert.equal(evidence.releaseSource.buildPassed, true, 'Build must pass before Phase 6 evidence is accepted')
    assert.equal(evidence.testLead?.globalProfileConfirmed, true, 'Evidence must confirm the lead used the global profile')
    assert.equal(evidence.testLead?.kingstonsProfileVisible, false, 'Evidence must confirm Kingstons profile was not visible')
    for (const checkKey of REQUIRED_CHECKS) {
      assert.equal(checks[checkKey].passed, true, `Phase 6 evidence check failed: ${checkKey}`)
    }

    const collectedAt = Date.parse(evidence.collectedAt)
    assert.ok(Number.isFinite(collectedAt), 'Evidence collectedAt must be a valid ISO timestamp')
    const ageHours = Math.abs(Date.now() - collectedAt) / 36e5
    assert.ok(
      ageHours <= MAX_EVIDENCE_AGE_HOURS || process.env.SELLER_PROCESS_GLOBAL_QA_ALLOW_STALE_EVIDENCE === 'true',
      `Evidence is stale: ${ageHours.toFixed(1)}h old`,
    )
    const expectedProjectRef = normalizeText(process.env.SELLER_PROCESS_GLOBAL_QA_EXPECTED_PROJECT_REF)
    if (expectedProjectRef) {
      assert.equal(evidence.projectRef, expectedProjectRef, 'Evidence projectRef does not match expected staging project')
    }
  }

  assertNoPrivateEvidence(evidence)
}

assert.equal(
  packageJson.scripts?.['test:seller-process-global-qa-phase6'],
  'node scripts/seller-process-global-qa-phase6.test.mjs',
)
assert.equal(
  packageJson.scripts?.['verify:seller-process-global-qa:staging'],
  'npm run test:seller-process-global-qa-phase5 && node scripts/seller-process-global-qa-phase6.test.mjs --require-evidence',
)

for (const [label, pattern] of [
  ['operator confirmation', /GLOBAL_SELLER_QA_PHASE6_REDACTED_EVIDENCE/],
  ['no onboarding send', /does not send onboarding links/],
  ['no mandate signature send', /does not send mandate signature\s+requests/],
  ['redacted emails', /must not contain emails/],
  ['profile separation', /global and Kingstons stay separated/],
]) {
  assert.match(phase6Doc, pattern, `Phase 6 doc must mention ${label}`)
}

assertEvidenceShape(evidenceTemplate, { template: true })
for (const checkKey of REQUIRED_CHECKS) {
  assert.equal(evidenceTemplate.checks[checkKey].passed, false, `Template check ${checkKey} should start false`)
}

const evidencePath = argValue('evidence')
const requireEvidence = process.argv.includes('--require-evidence')

if (!evidencePath) {
  assert.equal(requireEvidence, false, 'Phase 6 requires --evidence=<redacted-evidence.json> when --require-evidence is set')
  console.log('seller process global QA Phase 6 contract passed (evidence validation skipped)')
} else {
  const evidence = JSON.parse(readFileSync(resolve(process.cwd(), evidencePath), 'utf8'))
  assertEvidenceShape(evidence)
  console.log('seller process global QA Phase 6 evidence passed')
}
