import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase6Doc = readFileSync(resolve(appRoot, 'docs/buyer-process-phase6-release-readiness.md'), 'utf8')
const evidenceTemplate = JSON.parse(readFileSync(resolve(appRoot, 'docs/buyer-process-phase6-release-readiness.template.json'), 'utf8'))
const diagnosticSource = readFileSync(resolve(appRoot, 'scripts/buyer-process-global-diagnostic.test.mjs'), 'utf8')
const phase4Source = readFileSync(resolve(appRoot, 'scripts/buyer-process-onboarding-offer-upload-phase4.test.mjs'), 'utf8')
const transactionDetailSource = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
const repositorySource = readFileSync(resolve(appRoot, 'src/lib/agencyCrmRepository.js'), 'utf8')

const CONTRACT = 'buyer-process-phase6-release-readiness-v1'
const CONFIRMATION = 'BUYER_PROCESS_PHASE6_REDACTED_RELEASE_EVIDENCE'
const MAX_EVIDENCE_AGE_HOURS = Number(process.env.BUYER_PROCESS_RELEASE_MAX_EVIDENCE_AGE_HOURS || 36)
const REQUIRED_CHECKS = Object.freeze([
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
    const key = path[path.length - 1] || ''
    const structuralValue =
      key === 'collectedAt' ||
      key === 'buildCommand' ||
      key === 'globalDiagnosticCommand' ||
      key === 'confirmation' ||
      key === 'contract'
    assert.equal(/@[^\s.]+\.[^\s]+/.test(text), false, `Evidence must not contain email-like values at ${location}`)
    if (!structuralValue) {
      assert.equal(/\+?\d[\d\s().-]{7,}\d/.test(text), false, `Evidence must not contain phone-like values at ${location}`)
    }
    assert.equal(/https?:\/\/[^\s]+(?:token=|signed|signature|expires|X-Amz)/i.test(text), false, `Evidence must not contain signed URLs or tokenised links at ${location}`)
    assert.equal(/buyer[-_ ]?portal[-_ ]?token/i.test(text), false, `Evidence must not contain buyer portal token material at ${location}`)
    assert.equal(/onboarding[-_ ]?token/i.test(text), false, `Evidence must not contain onboarding token material at ${location}`)
    assert.equal(/\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(text) && !/Phase|Buyer Process|Arch9|Kingstons|Transaction Setup/.test(text), false, `Evidence must not contain likely client names at ${location}`)
  })
}

function assertEvidenceShape(evidence = {}, { template = false } = {}) {
  assert.equal(evidence.contract, CONTRACT)
  assert.ok(normalizeText(evidence.collectedAt), 'Evidence needs collectedAt')
  assert.ok(['staging', 'production_shadow'].includes(normalizeText(evidence.environment)), 'Evidence environment must be staging or production_shadow')
  assert.ok(normalizeText(evidence.projectRef), 'Evidence needs a safe projectRef')
  assert.equal(evidence.releaseSource?.globalDiagnosticCommand, 'npm run test:buyer-process-global-diagnostic')
  assert.equal(evidence.releaseSource?.buildCommand, 'npm run build')
  assert.equal(typeof evidence.releaseSource?.globalDiagnosticPassed, 'boolean')
  assert.equal(typeof evidence.releaseSource?.buildPassed, 'boolean')
  assert.ok(normalizeText(evidence.operator?.reference), 'Evidence needs an opaque operator reference')
  assert.equal(normalizeText(evidence.operator?.confirmation), CONFIRMATION, 'Evidence needs the exact operator confirmation phrase')
  assert.equal(typeof evidence.testLeads?.globalProfileConfirmed, 'boolean')
  assert.equal(typeof evidence.testLeads?.kingstonsManualOtpProfileConfirmed, 'boolean')
  assert.equal(typeof evidence.testLeads?.profilesStayedSeparated, 'boolean')

  const checks = evidence.checks || {}
  for (const checkKey of REQUIRED_CHECKS) {
    assert.equal(typeof checks[checkKey]?.passed, 'boolean', `Evidence check ${checkKey} needs a boolean passed value`)
    assert.ok(normalizeText(checks[checkKey]?.evidenceRef), `Evidence check ${checkKey} needs a redacted evidenceRef`)
  }

  if (!template) {
    assert.equal(evidence.releaseSource.globalDiagnosticPassed, true, 'Global diagnostic must pass before Phase 6 evidence is accepted')
    assert.equal(evidence.releaseSource.buildPassed, true, 'Build must pass before Phase 6 evidence is accepted')
    assert.equal(evidence.testLeads.globalProfileConfirmed, true, 'Evidence must confirm the global buyer process profile')
    assert.equal(evidence.testLeads.kingstonsManualOtpProfileConfirmed, true, 'Evidence must confirm the Kingstons manual OTP profile')
    assert.equal(evidence.testLeads.profilesStayedSeparated, true, 'Evidence must confirm profile separation')
    for (const checkKey of REQUIRED_CHECKS) {
      assert.equal(checks[checkKey].passed, true, `Phase 6 evidence check failed: ${checkKey}`)
    }

    const collectedAt = Date.parse(evidence.collectedAt)
    assert.ok(Number.isFinite(collectedAt), 'Evidence collectedAt must be a valid ISO timestamp')
    const ageHours = Math.abs(Date.now() - collectedAt) / 36e5
    assert.ok(
      ageHours <= MAX_EVIDENCE_AGE_HOURS || process.env.BUYER_PROCESS_RELEASE_ALLOW_STALE_EVIDENCE === 'true',
      `Evidence is stale: ${ageHours.toFixed(1)}h old`,
    )
    const expectedProjectRef = normalizeText(process.env.BUYER_PROCESS_RELEASE_EXPECTED_PROJECT_REF)
    if (expectedProjectRef) {
      assert.equal(evidence.projectRef, expectedProjectRef, 'Evidence projectRef does not match expected staging project')
    }
  }

  assertNoPrivateEvidence(evidence)
}

assert.equal(
  packageJson.scripts?.['test:buyer-process-release-readiness-phase6'],
  'node scripts/buyer-process-release-readiness-phase6.test.mjs',
)
assert.equal(
  packageJson.scripts?.['verify:buyer-process-release-readiness'],
  'npm run test:buyer-process-global-diagnostic && node scripts/buyer-process-release-readiness-phase6.test.mjs --require-evidence',
)
assert.match(
  packageJson.scripts?.['verify:buyer-process-global-diagnostic'] || '',
  /test:buyer-process-release-readiness-phase6/,
  'Global diagnostic verifier should include the local Phase 6 release-readiness contract.',
)

for (const [label, pattern] of [
  ['operator confirmation', new RegExp(CONFIRMATION)],
  ['non-mutating default', /non-mutating by default/i],
  ['redacted emails', /must not contain emails/i],
  ['redacted phone numbers', /must not contain emails, phone numbers/i],
  ['global stage order', /global buyer process uses Captured, Contacted, Qualification, Viewing,\s+Transaction Setup, Offer, Transaction/i],
  ['Kingstons stage order', /Kingstons buyer process uses Captured, Contacted, Qualification, Viewing,\s+Offer, Transaction Setup, Transaction/i],
  ['manual OTP stop condition', /Kingstons buyer lead exposes global onboarding as the primary path/i],
  ['handoff panel stop condition', /Buyer Process Handoff panel is missing/i],
]) {
  assert.match(phase6Doc, pattern, `Phase 6 doc must mention ${label}`)
}

assert.match(diagnosticSource, /test:offer-to-transaction-scenario-matrix/)
assert.match(phase4Source, /Buyer Process Handoff/)
assert.match(transactionDetailSource, /function BuyerProcessHandoffPanel/)
assert.match(transactionDetailSource, /buyerProcessLeadHandoff/)
assert.match(repositorySource, /converted_transaction_id = normalizeNullableUuid\(patch\.convertedTransactionId \|\| patch\.convertedDealId\)/)

assertEvidenceShape(evidenceTemplate, { template: true })
for (const checkKey of REQUIRED_CHECKS) {
  assert.equal(evidenceTemplate.checks[checkKey].passed, false, `Template check ${checkKey} should start false`)
}

const evidencePath = argValue('evidence')
const requireEvidence = process.argv.includes('--require-evidence')

if (!evidencePath) {
  assert.equal(requireEvidence, false, 'Phase 6 requires --evidence=<redacted-evidence.json> when --require-evidence is set')
  console.log('buyer process Phase 6 release-readiness contract passed (evidence validation skipped)')
} else {
  const evidence = JSON.parse(readFileSync(resolve(process.cwd(), evidencePath), 'utf8'))
  assertEvidenceShape(evidence)
  console.log('buyer process Phase 6 release-readiness evidence passed')
}
