import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidenceArg = process.argv.find((arg) => arg.startsWith('--evidence='))
const deploymentEvidenceArg = process.argv.find((arg) => arg.startsWith('--deployment-evidence='))

if (!evidenceArg) throw new Error('Use --evidence=<path-to-staging-journey-evidence.json>.')
if (!deploymentEvidenceArg) throw new Error('Use --deployment-evidence=<path-to-staging-deployment-evidence.json>.')

const evidencePath = path.resolve(repoRoot, evidenceArg.slice('--evidence='.length))
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
const deploymentEvidencePath = path.resolve(repoRoot, deploymentEvidenceArg.slice('--deployment-evidence='.length))
const deploymentCheck = spawnSync(process.execPath, [
  'scripts/mvp-staging-deployment-evidence-check.mjs',
  `--evidence=${deploymentEvidencePath}`,
], { cwd: repoRoot, encoding: 'utf8' })
assert.equal(deploymentCheck.status, 0, `Phase 3D deployment evidence did not pass: ${deploymentCheck.stderr || deploymentCheck.stdout}`)
const deployment = JSON.parse(deploymentCheck.stdout)
const requiredScenarios = [
  'cash_individual_resale',
  'bond_company_private_sale',
  'hybrid_trust_resale',
  'development_company_development_sale',
]
const requiredChecks = [
  'leadCreated',
  'offerAccepted',
  'transactionCreated',
  'participantsVisible',
  'documentsSeeded',
  'workflowLanesSeeded',
  'onboardingGateBlockedThenCleared',
  'otpGateBlockedThenCleared',
  'financeGateBlockedThenCleared',
  'transferGateBlockedThenCleared',
  'registrationReady',
  'postDeploySmokePassed',
]

assert.equal(evidence.environment, 'staging', 'Journey evidence must be from staging.')
assert.equal(evidence.projectRef, deployment.projectRef, 'Journey evidence must use the Phase 3D staging project.')
assert.ok(String(evidence.executedBy || '').trim(), 'Journey evidence requires the staging test operator.')
assert.ok(String(evidence.completedAt || '').trim(), 'Journey evidence requires completedAt.')
assert.equal(evidence.executionMethod, 'ui', 'MVP journeys must be completed through the UI.')
assert.equal(Array.isArray(evidence.scenarios), true, 'Journey evidence requires a scenarios array.')
const byId = new Map(evidence.scenarios.map((scenario) => [scenario.id, scenario]))
assert.deepEqual([...byId.keys()].sort(), [...requiredScenarios].sort(), 'Evidence must contain exactly the four MVP journeys.')

const transactionIds = new Set()
for (const scenarioId of requiredScenarios) {
  const scenario = byId.get(scenarioId)
  assert.ok(String(scenario.transactionId || '').trim(), `${scenarioId}: transactionId is required.`)
  assert.equal(transactionIds.has(scenario.transactionId), false, `${scenarioId}: transaction id must be unique.`)
  transactionIds.add(scenario.transactionId)
  assert.ok(String(scenario.acceptedOfferId || '').trim(), `${scenarioId}: acceptedOfferId is required.`)
  assert.equal(scenario.createdThrough, 'accepted_offer_ui', `${scenarioId}: transaction must be created through the accepted-offer UI path.`)
  for (const check of requiredChecks) {
    assert.equal(scenario.checks?.[check], true, `${scenarioId}: ${check} must be true.`)
  }
}

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_journey_evidence_v1',
  passed: true,
  environment: evidence.environment,
  projectRef: evidence.projectRef,
  executedBy: evidence.executedBy,
  scenarioCount: requiredScenarios.length,
  transactionIds: [...transactionIds],
}, null, 2))
