import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  const output = result.stdout || result.stderr || ''
  let report = null
  try { report = JSON.parse(result.stdout) } catch { /* Exit status remains the source of truth. */ }
  return { passed: result.status === 0, output, report }
}

const requiredFiles = ['staging-ledger', 'deployment-evidence', 'rollback-evidence', 'journey-evidence', 'review-evidence', 'decision-evidence']
const missingInputs = requiredFiles.filter((name) => !options[name])
const checks = []

checks.push({ name: 'local_phase_1', ...runNode(['scripts/mvp-seller-acceptance-contract-check.mjs']) })
checks.push({ name: 'local_phase_2', ...runNode(['scripts/mvp-lifecycle-atomic-contract-check.mjs']) })

if (!missingInputs.length) {
  checks.push({ name: 'staging_migration_plan', ...runNode(['scripts/mvp-staging-migration-plan.mjs', `--ledger=${options['staging-ledger']}`]) })
  checks.push({ name: 'staging_deployment', ...runNode(['scripts/mvp-staging-deployment-evidence-check.mjs', `--evidence=${options['deployment-evidence']}`]) })
  checks.push({ name: 'staging_rollback_drill', ...runNode([
    'scripts/mvp-staging-rollback-evidence-check.mjs',
    `--evidence=${options['rollback-evidence']}`,
    `--deployment-evidence=${options['deployment-evidence']}`,
  ]) })
  checks.push({ name: 'staging_journeys', ...runNode(['scripts/mvp-staging-journey-evidence-check.mjs', `--evidence=${options['journey-evidence']}`, `--deployment-evidence=${options['deployment-evidence']}`]) })
  checks.push({ name: 'staging_review', ...runNode([
    'scripts/mvp-staging-review-evidence-check.mjs',
    `--journey-evidence=${options['journey-evidence']}`,
    `--deployment-evidence=${options['deployment-evidence']}`,
    `--review-evidence=${options['review-evidence']}`,
  ]) })
  checks.push({ name: 'production_decision', ...runNode([
    'scripts/mvp-production-decision-evidence-check.mjs',
    `--evidence=${options['decision-evidence']}`,
    `--deployment-evidence=${options['deployment-evidence']}`,
  ]) })
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
  owners: checks.find((check) => check.name === 'production_decision')?.report?.owners || null,
}

console.log(JSON.stringify(report, null, 2))
if (report.decision !== 'ready_for_controlled_production_pilot') process.exit(1)
