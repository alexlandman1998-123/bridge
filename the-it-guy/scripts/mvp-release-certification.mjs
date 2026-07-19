import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')

const checks = [
  ['launch scope', appRoot, ['src/core/transactions/__tests__/mvpLaunchScope.test.js']],
  ['launch roles', appRoot, ['src/core/transactions/__tests__/mvpLaunchRoles.test.js']],
  ['transaction truth', appRoot, ['src/core/transactions/__tests__/mvpTransactionTruth.test.js']],
  ['creation command', appRoot, ['src/core/transactions/__tests__/mvpTransactionCreationCommand.test.js']],
  ['participant bootstrap', appRoot, ['src/core/transactions/__tests__/mvpTransactionParticipantBootstrap.test.js']],
  ['document bootstrap', appRoot, ['src/core/transactions/__tests__/mvpTransactionDocumentBootstrap.test.js']],
  ['workflow bootstrap', appRoot, ['src/core/transactions/__tests__/mvpTransactionWorkflowBootstrap.test.js']],
  ['onboarding gate', appRoot, ['src/core/transactions/__tests__/mvpOnboardingGate.test.js']],
  ['OTP gate', appRoot, ['src/core/transactions/__tests__/mvpOtpGate.test.js']],
  ['finance gate', appRoot, ['src/core/transactions/__tests__/mvpFinanceGate.test.js']],
  ['transfer gate', appRoot, ['src/core/transactions/__tests__/mvpTransferGate.test.js']],
  ['transaction integrity', appRoot, ['src/core/transactions/__tests__/mvpTransactionIntegrityAudit.test.js']],
  ['server gate enforcement', appRoot, ['server/tests/mvpWorkflowGateEnforcementService.test.js']],
  ['seller acceptance canonical creation', repoRoot, ['scripts/mvp-seller-acceptance-contract-check.mjs']],
  ['lifecycle atomic creation', repoRoot, ['scripts/mvp-lifecycle-atomic-contract-check.mjs']],
  ['database schema contract', appRoot, ['scripts/mvp-schema-contract-check.mjs']],
  ['scenario and rejection simulation', appRoot, ['scripts/mvp-transaction-simulation.mjs']],
  ['100-transaction capacity and integrity', appRoot, ['scripts/mvp-transaction-load-check.mjs']],
  ['migration freeze', repoRoot, ['scripts/mvp-migration-freeze-check.test.mjs']],
  ['staging-plan safety', repoRoot, ['scripts/mvp-staging-migration-plan.test.mjs']],
  ['staging journey evidence safety', repoRoot, ['scripts/mvp-staging-journey-evidence-check.test.mjs']],
  ['staging review evidence safety', repoRoot, ['scripts/mvp-staging-review-evidence-check.test.mjs']],
  ['production readiness safety', repoRoot, ['scripts/mvp-production-readiness-check.test.mjs']],
  ['production decision evidence safety', repoRoot, ['scripts/mvp-production-decision-evidence-check.test.mjs']],
  ['staging rollback drill evidence safety', repoRoot, ['scripts/mvp-staging-rollback-evidence-check.test.mjs']],
  ['pilot controls', repoRoot, ['scripts/mvp-pilot-controls.test.mjs']],
  ['scale progression', repoRoot, ['scripts/mvp-scale-progression.test.mjs']],
  ['staging ledger capture', repoRoot, ['scripts/mvp-staging-ledger-capture.test.mjs']],
  ['staging ledger classification', repoRoot, ['scripts/mvp-migration-ledger-classify.test.mjs']],
  ['canonical migration planning', repoRoot, ['scripts/mvp-canonical-migration-plan.test.mjs']],
]

const results = checks.map(([name, cwd, args]) => {
  const run = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  return { name, passed: run.status === 0, output: `${run.stdout || ''}${run.stderr || ''}`.trim() }
})
const failed = results.filter((result) => !result.passed)
console.log(JSON.stringify({
  version: 'arch9_mvp_release_certification_v2',
  scope: 'local_release_contracts_only',
  passed: failed.length === 0,
  checks: results.map(({ name, passed }) => ({ name, passed })),
  failedChecks: failed.map((result) => result.name),
  stagingEvidenceRequired: true,
}, null, 2))

if (failed.length) {
  for (const result of failed) process.stderr.write(`\n${result.name}:\n${result.output}\n`)
  process.exit(1)
}
