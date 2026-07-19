import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  return { passed: result.status === 0, output: result.stdout || result.stderr || '' }
}

function readJsonOption(name) {
  const supplied = options[name]
  if (!supplied) return null
  const target = path.resolve(repoRoot, supplied)
  if (!existsSync(target)) throw new Error(`${name} file not found: ${supplied}`)
  return JSON.parse(readFileSync(target, 'utf8'))
}

const requiredFiles = ['staging-ledger', 'deployment-evidence', 'journey-evidence', 'review-evidence', 'decision-evidence']
const missingInputs = requiredFiles.filter((name) => !options[name])
const checks = []

checks.push({ name: 'local_phase_1', ...runNode(['scripts/mvp-seller-acceptance-contract-check.mjs']) })
checks.push({ name: 'local_phase_2', ...runNode(['scripts/mvp-lifecycle-atomic-contract-check.mjs']) })

if (!missingInputs.length) {
  checks.push({ name: 'staging_migration_plan', ...runNode(['scripts/mvp-staging-migration-plan.mjs', `--ledger=${options['staging-ledger']}`]) })
  checks.push({ name: 'staging_deployment', ...runNode(['scripts/mvp-staging-deployment-evidence-check.mjs', `--evidence=${options['deployment-evidence']}`]) })
  checks.push({ name: 'staging_journeys', ...runNode(['scripts/mvp-staging-journey-evidence-check.mjs', `--evidence=${options['journey-evidence']}`, `--deployment-evidence=${options['deployment-evidence']}`]) })
  checks.push({ name: 'staging_review', ...runNode([
    'scripts/mvp-staging-review-evidence-check.mjs',
    `--journey-evidence=${options['journey-evidence']}`,
    `--deployment-evidence=${options['deployment-evidence']}`,
    `--review-evidence=${options['review-evidence']}`,
  ]) })
}

let decisionEvidence = null
if (!missingInputs.length) {
  decisionEvidence = readJsonOption('decision-evidence')
  for (const field of ['releaseOwner', 'pilotOwner', 'supportOwner', 'rollbackOwner']) {
    assert.ok(String(decisionEvidence?.[field] || '').trim(), `decision-evidence requires ${field}.`)
  }
  assert.equal(decisionEvidence?.rollbackProcedureReviewed, true, 'Rollback procedure must be reviewed.')
  assert.equal(decisionEvidence?.knownMvpLimitationsAccepted, true, 'Known MVP limitations must be accepted.')
}

const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name)
const blockers = [
  ...missingInputs.map((name) => `missing_${name}`),
  ...failedChecks,
]
const report = {
  version: 'arch9_mvp_production_readiness_v1',
  decision: blockers.length ? 'no_go' : 'ready_for_controlled_production_pilot',
  blockers,
  checks: checks.map(({ name, passed }) => ({ name, passed })),
  monthlyTransactionLimit: 100,
  permittedInitialBatchSize: 10,
  owners: decisionEvidence ? {
    releaseOwner: decisionEvidence.releaseOwner,
    pilotOwner: decisionEvidence.pilotOwner,
    supportOwner: decisionEvidence.supportOwner,
    rollbackOwner: decisionEvidence.rollbackOwner,
  } : null,
}

console.log(JSON.stringify(report, null, 2))
if (report.decision !== 'ready_for_controlled_production_pilot') process.exit(1)
