#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const appDir = `${repoRoot}/the-it-guy`

const batches = {
  'seller-process-next-action-fix': {
    description: 'Verify PR #12 seller-process contracts after marking the stale PR as superseded.',
    commands: [
      { cwd: appDir, cmd: 'node scripts/seller-process-workspace-panel-phase8.test.mjs' },
      { cwd: appDir, cmd: 'node scripts/seller-process-panel-action-routing-phase9.test.mjs' },
    ],
  },
  'reminder-health-controls': {
    description: 'Verify notification automation reminder health controls.',
    commands: [
      { cwd: appDir, cmd: 'node scripts/notification-automation-reminder-health-controls.test.mjs' },
      { cwd: appDir, cmd: 'npm run build' },
    ],
  },
  'arch9-attorney-access-permission-bootstrap': {
    description: 'Verify attorney workspace permission bootstrap.',
    commands: [
      { cwd: appDir, cmd: 'node src/services/__tests__/workspaceResolutionService.test.js' },
      { cwd: appDir, cmd: 'npm run build' },
    ],
  },
  'phase0-closeout-evidence': {
    description: 'Verify Phase 0 guard retirement after explicit approval.',
    commands: [
      { cwd: repoRoot, cmd: 'node scripts/supabase-phase0-retirement.test.mjs' },
      { cwd: repoRoot, cmd: 'node scripts/supabase-phase8-closeout.test.mjs' },
      { cwd: appDir, cmd: 'npm run build' },
    ],
  },
  'recover-buyer-onboarding-projection': {
    description: 'Verify buyer onboarding projection recovery.',
    commands: [
      { cwd: appDir, cmd: 'node scripts/buyer-onboarding-projection-recovery-contract.test.mjs' },
      { cwd: appDir, cmd: 'node scripts/mandate-readiness-canonical-facts.test.mjs' },
      { cwd: appDir, cmd: 'node scripts/seller-onboarding-progress-serialization.test.mjs' },
      { cwd: appDir, cmd: 'npm run build' },
    ],
  },
  'hq-owner-dashboard': {
    description: 'Verify bond HQ owner dashboard changes.',
    commands: [
      { cwd: appDir, cmd: 'node src/components/bond/__tests__/BondDashboard.test.jsx' },
      { cwd: appDir, cmd: 'npm run build' },
    ],
  },
  'final-smoke': {
    description: 'Run final broad smoke before opening the reconciliation PR.',
    commands: [
      { cwd: appDir, cmd: 'npm test' },
      { cwd: appDir, cmd: 'npm run build' },
    ],
  },
}

function run({ cwd, cmd }, allowFailure = false) {
  console.log(`\n$ ${cmd}`)
  console.log(`# cwd: ${cwd}`)
  const result = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status || 1)
  }
  return result.status || 0
}

function printUsage() {
  console.log('Usage: node scripts/reconciliation-verify-batch.mjs <batch-name>')
  console.log('')
  console.log('Available batches:')
  for (const [name, batch] of Object.entries(batches)) {
    console.log(`  ${name} - ${batch.description}`)
  }
}

const batchName = process.argv[2]
if (!batchName || batchName === '--help' || batchName === '-h') {
  printUsage()
  process.exit(batchName ? 0 : 1)
}

if (batchName === '--list') {
  for (const name of Object.keys(batches)) console.log(name)
  process.exit(0)
}

const batch = batches[batchName]
if (!batch) {
  console.error(`Unknown batch: ${batchName}`)
  printUsage()
  process.exit(1)
}

console.log(`Verifying reconciliation batch: ${batchName}`)
console.log(batch.description)

run({ cwd: repoRoot, cmd: 'git status --short --branch' })

const conflictScanStatus = run(
  { cwd: repoRoot, cmd: "git grep -n -E '^(<<<<<<<|=======|>>>>>>>)' -- . ':!docs/reconciliation-*.md'" },
  true,
)
if (conflictScanStatus === 0) {
  console.error('Conflict markers detected. Resolve them before continuing.')
  process.exit(1)
}

for (const command of batch.commands) {
  run(command)
}

console.log(`\nBatch verification passed: ${batchName}`)
