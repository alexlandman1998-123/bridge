import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidenceArg = process.argv.find((arg) => arg.startsWith('--evidence='))

if (!evidenceArg) throw new Error('Use --evidence=<path-to-staging-journey-evidence.json>.')

const evidencePath = path.resolve(repoRoot, evidenceArg.slice('--evidence='.length))
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
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
  for (const check of requiredChecks) {
    assert.equal(scenario.checks?.[check], true, `${scenarioId}: ${check} must be true.`)
  }
}

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_journey_evidence_v1',
  passed: true,
  environment: evidence.environment,
  scenarioCount: requiredScenarios.length,
  transactionIds: [...transactionIds],
}, null, 2))
