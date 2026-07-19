import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
if (!options['journey-evidence'] || !options['review-evidence'] || !options['deployment-evidence']) {
  throw new Error('Use --journey-evidence=<path> --deployment-evidence=<path> --review-evidence=<path>.')
}

const journeyPath = path.resolve(repoRoot, options['journey-evidence'])
const journey = JSON.parse(readFileSync(journeyPath, 'utf8'))
const deploymentEvidencePath = path.resolve(repoRoot, options['deployment-evidence'])
const deployment = JSON.parse(readFileSync(deploymentEvidencePath, 'utf8'))
const phase4 = spawnSync(process.execPath, [
  'scripts/mvp-staging-journey-evidence-check.mjs',
  `--evidence=${journeyPath}`,
  `--deployment-evidence=${options['deployment-evidence']}`,
], {
  cwd: repoRoot,
  encoding: 'utf8',
})
assert.equal(phase4.status, 0, `Phase 4 journey evidence did not pass: ${phase4.stderr || phase4.stdout}`)

const reviewPath = path.resolve(repoRoot, options['review-evidence'])
const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
const requiredScenarioIds = [
  'cash_individual_resale',
  'bond_company_private_sale',
  'hybrid_trust_resale',
  'development_company_development_sale',
]

assert.equal(review.environment, 'staging', 'Review evidence must be from staging.')
assert.equal(review.projectRef, journey.projectRef, 'Review evidence must use the Phase 4 staging project.')
assert.equal(deployment.projectRef, journey.projectRef, 'Deployment and journey evidence must use the same staging project.')
assert.ok(String(review.reviewedBy || '').trim(), 'A named operational reviewer is required.')
assert.ok(String(review.reviewedAt || '').trim(), 'reviewedAt is required.')
assert.equal(review.reviewerIsDeveloper, false, 'The Phase 5 reviewer must not be a developer.')
assert.equal(review.reviewedIndependently, true, 'The Phase 5 review must be independent.')
assert.notEqual(review.reviewedBy, journey.executedBy, 'The operational reviewer must be different from the Phase 4 journey operator.')
assert.equal(['operations', 'conveyancing', 'administration'].includes(String(review.reviewerRole || '').toLowerCase()), true, 'reviewerRole must be operations, conveyancing, or administration.')
assert.equal(Array.isArray(review.scenarioReviews), true, 'scenarioReviews is required.')
const scenarioReviews = new Map(review.scenarioReviews.map((entry) => [entry.id, entry]))
assert.deepEqual([...scenarioReviews.keys()].sort(), [...requiredScenarioIds].sort(), 'All four MVP scenarios require an operations review.')

for (const scenarioId of requiredScenarioIds) {
  const entry = scenarioReviews.get(scenarioId)
  assert.equal(entry.completedWithoutDeveloperGuidance, true, `${scenarioId}: must complete without developer guidance.`)
  assert.equal(entry.nextActionClear, true, `${scenarioId}: next action must be clear.`)
  assert.equal(entry.errorsActionable, true, `${scenarioId}: error state must be actionable.`)
  assert.equal(entry.postDeployDataReviewed, true, `${scenarioId}: post-deploy data must be reviewed.`)
}

const findings = Array.isArray(review.findings) ? review.findings : []
const findingIds = new Set()
const blockingSeverities = new Set(['p0', 'p1', 'critical', 'high'])
for (const finding of findings) {
  const id = String(finding.id || '').trim()
  const severity = String(finding.severity || '').toLowerCase()
  const status = String(finding.status || '').toLowerCase()
  assert.ok(id, 'Each finding requires an id.')
  assert.equal(findingIds.has(id), false, `Duplicate finding id: ${id}`)
  findingIds.add(id)
  assert.equal(['p0', 'p1', 'p2', 'p3', 'critical', 'high', 'medium', 'low'].includes(severity), true, `${id}: severity is invalid.`)
  assert.ok(String(finding.summary || '').trim(), `${id}: summary is required.`)
  assert.ok(String(finding.owner || '').trim(), `${id}: owner is required.`)
  assert.ok(String(finding.recordedAt || '').trim(), `${id}: recordedAt is required.`)
  assert.equal(['resolved', 'deferred'].includes(status), true, `${id}: status must be resolved or deferred.`)
  if (blockingSeverities.has(severity)) {
    assert.equal(status, 'resolved', `${id}: release-blocking findings must be resolved.`)
    assert.equal(finding.resolved, true, `${id}: release-blocking finding must be marked resolved.`)
  }
  if (status === 'resolved') {
    assert.equal(finding.resolved, true, `${id}: resolved findings must set resolved to true.`)
    assert.ok(String(finding.resolution || '').trim(), `${id}: resolved findings require a resolution.`)
    assert.ok(String(finding.resolvedAt || '').trim(), `${id}: resolved findings require resolvedAt.`)
  }
  if (status === 'deferred') {
    assert.equal(finding.resolved, false, `${id}: deferred findings must set resolved to false.`)
    assert.ok(String(finding.nextReviewAt || '').trim(), `${id}: deferred findings require nextReviewAt.`)
  }
}
const releaseBlocking = findings.filter((finding) => blockingSeverities.has(String(finding.severity || '').toLowerCase()) && finding.resolved !== true)
assert.deepEqual(releaseBlocking, [], 'Critical or high review findings must be resolved before pilot.')
const deferredFindingIds = findings
  .filter((finding) => String(finding.status || '').toLowerCase() === 'deferred')
  .map((finding) => String(finding.id))
  .sort()
const acceptance = review.stagingAcceptance || {}
assert.equal(acceptance.decision, 'accepted_for_pilot_consideration', 'Operations must explicitly accept staging for pilot consideration.')
assert.ok(String(acceptance.decidedBy || '').trim(), 'stagingAcceptance.decidedBy is required.')
assert.ok(String(acceptance.decidedAt || '').trim(), 'stagingAcceptance.decidedAt is required.')
assert.equal(acceptance.deciderIsDeveloper, false, 'The staging acceptance decider must not be a developer.')
assert.equal(acceptance.scope, 'all_four_mvp_scenarios', 'Staging acceptance must cover all four MVP scenarios.')
assert.deepEqual([...(acceptance.deferredFindingIds || [])].map(String).sort(), deferredFindingIds, 'Staging acceptance must acknowledge every deferred finding.')

function timestamp(value, field) {
  const parsed = Date.parse(String(value || ''))
  assert.equal(Number.isNaN(parsed), false, `${field} must be an ISO-compatible timestamp.`)
  return parsed
}

const deployedAt = timestamp(deployment.deployedAt, 'deployment.deployedAt')
const journeyCompletedAt = timestamp(journey.completedAt, 'journey.completedAt')
const reviewedAt = timestamp(review.reviewedAt, 'review.reviewedAt')
const acceptanceDecidedAt = timestamp(acceptance.decidedAt, 'stagingAcceptance.decidedAt')
assert.ok(deployedAt <= journeyCompletedAt, 'The deployment evidence must precede the UI journey.')
assert.ok(journeyCompletedAt <= reviewedAt, 'The UI journey must precede the operational review.')
assert.ok(reviewedAt <= acceptanceDecidedAt, 'The operational review must precede staging acceptance.')
for (const finding of findings) {
  const id = String(finding.id)
  const recordedAt = timestamp(finding.recordedAt, `${id}.recordedAt`)
  assert.ok(journeyCompletedAt <= recordedAt && recordedAt <= acceptanceDecidedAt, `${id}: recordedAt must fall between journey completion and staging acceptance.`)
  if (String(finding.status).toLowerCase() === 'resolved') {
    const resolvedAt = timestamp(finding.resolvedAt, `${id}.resolvedAt`)
    assert.ok(recordedAt <= resolvedAt && resolvedAt <= acceptanceDecidedAt, `${id}: resolvedAt must fall between finding capture and staging acceptance.`)
  }
  if (String(finding.status).toLowerCase() === 'deferred') {
    const nextReviewAt = timestamp(finding.nextReviewAt, `${id}.nextReviewAt`)
    assert.ok(acceptanceDecidedAt < nextReviewAt, `${id}: nextReviewAt must follow staging acceptance.`)
  }
}

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_review_evidence_v1',
  passed: true,
  reviewer: review.reviewedBy,
  reviewerRole: review.reviewerRole,
  journeyOperator: journey.executedBy,
  scenarioCount: requiredScenarioIds.length,
  findingCount: findings.length,
  deferredFindingCount: findings.filter((finding) => String(finding.status || '').toLowerCase() === 'deferred').length,
  stagingAcceptance: acceptance.decision,
  stagingAcceptanceDecider: acceptance.decidedBy,
  evidenceTimeline: 'deployment_then_ui_then_review_then_acceptance',
  unresolvedReleaseBlockingFindings: 0,
}, null, 2))
