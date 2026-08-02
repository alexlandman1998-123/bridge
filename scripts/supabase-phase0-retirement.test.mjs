#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const retiredPaths = [
  '.github/workflows/supabase-phase0-guard.yml',
  'scripts/supabase-phase0-guard.mjs',
  'scripts/supabase-phase0-guard.test.mjs',
  'scripts/supabase-phase0-migration-freeze.mjs',
]

for (const relativePath of retiredPaths) {
  assert.equal(
    existsSync(path.join(repoRoot, relativePath)),
    false,
    `${relativePath} must remain retired after Phase 0 closeout`,
  )
}

const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const appPackage = JSON.parse(readFileSync(path.join(repoRoot, 'the-it-guy', 'package.json'), 'utf8'))
for (const packageJson of [rootPackage, appPackage]) {
  for (const scriptName of ['supabase:phase0', 'supabase:guard', 'supabase:db-push']) {
    assert.equal(packageJson.scripts?.[scriptName], undefined, `${scriptName} must not reintroduce the retired guard`)
  }
}

const closeout = JSON.parse(readFileSync(
  path.join(repoRoot, 'docs', 'supabase-push-phase-7-closeout.json'),
  'utf8',
))
assert.equal(closeout.status, 'READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT')
assert.equal(closeout.closeoutReady, true)
assert.equal(closeout.liveCloseout?.counts?.manifestRows, 33)
assert.equal(closeout.liveCloseout?.counts?.completeEvidenceRows, 33)
assert.equal(closeout.liveCloseout?.ledger?.pureLocalOnly, 0)
assert.equal(closeout.liveCloseout?.ledger?.pureRemoteOnly, 0)
assert.equal(closeout.liveCloseout?.ledger?.divergent, 0)
assert.equal(closeout.liveCloseout?.ledger?.unreviewedSplitVersions, 0)
assert.equal(closeout.liveCloseout?.recovery?.recoverable, true)
assert.equal(closeout.liveCloseout?.recovery?.physicalBackupCount, 7)

console.log('Supabase Phase 0 guard retirement checks passed.')
