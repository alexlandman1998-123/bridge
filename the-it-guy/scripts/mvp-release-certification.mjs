import { spawnSync } from 'node:child_process'

const checks = [
  ['launch scope', ['src/core/transactions/__tests__/mvpLaunchScope.test.js']],
  ['launch roles', ['src/core/transactions/__tests__/mvpLaunchRoles.test.js']],
  ['transaction truth', ['src/core/transactions/__tests__/mvpTransactionTruth.test.js']],
  ['creation command', ['src/core/transactions/__tests__/mvpTransactionCreationCommand.test.js']],
  ['participant bootstrap', ['src/core/transactions/__tests__/mvpTransactionParticipantBootstrap.test.js']],
  ['document bootstrap', ['src/core/transactions/__tests__/mvpTransactionDocumentBootstrap.test.js']],
  ['workflow bootstrap', ['src/core/transactions/__tests__/mvpTransactionWorkflowBootstrap.test.js']],
  ['onboarding gate', ['src/core/transactions/__tests__/mvpOnboardingGate.test.js']],
  ['OTP gate', ['src/core/transactions/__tests__/mvpOtpGate.test.js']],
  ['finance gate', ['src/core/transactions/__tests__/mvpFinanceGate.test.js']],
  ['transfer gate', ['src/core/transactions/__tests__/mvpTransferGate.test.js']],
  ['MVP database schema contract', ['scripts/mvp-schema-contract-check.mjs']],
  ['scenario report', ['scripts/mvp-transaction-simulation.mjs']],
  ['synthetic core flow', ['scripts/mvp-synthetic-core-flow.mjs']],
  ['accepted-offer conversion receipt', ['scripts/mvp-accepted-offer-conversion-receipt.test.mjs']],
  ['buyer onboarding notification contract', ['scripts/buyer-onboarding-notification-contract.test.mjs']],
  ['agency lead selection null safety', ['scripts/agency-lead-selection-null-safety.test.mjs']],
  ['transaction health and audit recovery', ['scripts/mvp-transaction-health-panel.test.mjs']],
  ['transaction audit and notification recovery', ['scripts/mvp-transaction-audit-recovery.test.mjs']],
  ['pilot batch audit controls', ['scripts/mvp-pilot-batch-audit.test.mjs']],
  ['exposure-readiness evidence controls', ['scripts/mvp-exposure-readiness.test.mjs']],
  ['phase 8 pilot go/no-go controls', ['scripts/mvp-pilot-go-no-go.test.mjs']],
  ['100-transaction capacity and integrity', ['scripts/mvp-transaction-load-check.mjs']],
  ['2-transaction pilot batch dry run', ['scripts/mvp-pilot-batch-dry-run.mjs']],
]

const results = []
for (const [name, args] of checks) {
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' })
  results.push({ name, passed: run.status === 0, output: `${run.stdout || ''}${run.stderr || ''}`.trim() })
}

const failed = results.filter((result) => !result.passed)
console.log(JSON.stringify({
  version: 'arch9_mvp_release_certification_v1',
  passed: failed.length === 0,
  checks: results.map(({ name, passed }) => ({ name, passed })),
  failedChecks: failed.map((result) => result.name),
}, null, 2))

if (failed.length) {
  for (const result of failed) process.stderr.write(`\n${result.name}:\n${result.output}\n`)
  process.exit(1)
}
