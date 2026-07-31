#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateMigrationFreeze,
  isResolvedLedgerRecord,
} from './supabase-phase0-migration-freeze.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const guardPath = path.join(repoRoot, 'scripts', 'supabase-phase0-guard.mjs')

function runGuard(args, env = {}) {
  return spawnSync(process.execPath, [guardPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BRIDGE_SUPABASE_PHASE0_OVERRIDE: '',
      ...env,
    },
    encoding: 'utf8',
  })
}

const status = runGuard(['--status'])
assert.equal(status.status, 0, status.stderr)
assert.match(status.stdout, /Supabase Phase 0 stabilization guard is active\./)

for (const args of [
  ['db', 'push', '--linked'],
  ['db', 'reset', '--linked'],
  ['migration', 'repair', '--linked', '--status', 'applied', '200001010001'],
]) {
  const result = runGuard(args)
  assert.equal(result.status, 2, `Expected supabase ${args.join(' ')} to be blocked.\n${result.stdout}\n${result.stderr}`)
  assert.match(result.stderr, /Blocked by Supabase Phase 0 stabilization guard\./)
}

const diagnostic = runGuard(['migration', 'list', '--linked'])
assert.equal(diagnostic.status, 0, diagnostic.stderr)
assert.match(diagnostic.stdout, /Allowed Phase 0 work:/)

const override = runGuard(
  ['db', 'push', '--linked'],
  { BRIDGE_SUPABASE_PHASE0_OVERRIDE: 'I_UNDERSTAND_LEDGER_DRIFT' },
)
assert.equal(override.status, 0, override.stderr)
assert.match(override.stderr, /Phase 0 override accepted\./)

const resolvedLedger = {
  status: 'LEDGER_DRIFT_RESOLVED',
  resolved: true,
  counts: { blockers: 0 },
  blockers: [],
}
const unresolvedLedger = {
  status: 'LEDGER_DRIFT_BLOCKED',
  resolved: false,
  counts: { blockers: 1 },
  blockers: ['unresolved drift'],
}

assert.equal(isResolvedLedgerRecord(resolvedLedger), true)
assert.equal(isResolvedLedgerRecord(unresolvedLedger), false)
assert.equal(evaluateMigrationFreeze({
  addedMigrations: [],
  baseLedger: unresolvedLedger,
  headLedger: unresolvedLedger,
}).allowed, true)
assert.equal(evaluateMigrationFreeze({
  addedMigrations: ['supabase/migrations/202607310006_legal_document_agent_notification_sequence.sql'],
  baseLedger: resolvedLedger,
  headLedger: resolvedLedger,
}).allowed, true)
assert.equal(evaluateMigrationFreeze({
  addedMigrations: ['supabase/migrations/202607310006_legal_document_agent_notification_sequence.sql'],
  baseLedger: unresolvedLedger,
  headLedger: resolvedLedger,
}).allowed, false)

console.log('Supabase Phase 0 guard tests passed.')
