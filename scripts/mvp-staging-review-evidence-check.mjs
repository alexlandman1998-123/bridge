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
assert.ok(String(review.reviewedBy || '').trim(), 'A named operational reviewer is required.')
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
const releaseBlocking = findings.filter((finding) => ['p0', 'p1', 'critical', 'high'].includes(String(finding.severity || '').toLowerCase()) && finding.resolved !== true)
assert.deepEqual(releaseBlocking, [], 'Critical or high review findings must be resolved before pilot.')

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_review_evidence_v1',
  passed: true,
  reviewer: review.reviewedBy,
  scenarioCount: requiredScenarioIds.length,
  findingCount: findings.length,
  unresolvedReleaseBlockingFindings: 0,
}, null, 2))
