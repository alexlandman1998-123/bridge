#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'supabase-phase8-closeout.mjs')
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'supabase-phase-5-application-manifest.json'), 'utf8'))
const promotion = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'supabase-push-phase-5-production-promotion.json'), 'utf8'))

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], { cwd: repoRoot, encoding: 'utf8' })
}

const plan = run(['--plan', '--json'])
assert.equal(plan.status, 0, plan.stderr)
const result = JSON.parse(plan.stdout)
assert.equal(result.status, 'LOCAL_CLOSEOUT_NOT_READY')
assert.equal(result.readyForFreezeRetirement, false)
assert.equal(result.rawManifestRowCount, manifest.rows.length)
assert.equal(result.manifestRowCount, promotion.rows.length)
assert.equal(result.closeoutScope.source, 'docs/supabase-push-phase-5-production-promotion.json')
assert.equal(result.duplicateVersions.length, 0)
assert.equal(result.missingManifestFiles.length, 0)
assert.equal(result.evidence.complete.length + result.evidence.incomplete.length, promotion.rows.length)
assert.equal(result.evidence.duplicates.length, 0)
assert.equal(result.live, null)

const unknown = run(['--not-a-real-option'])
assert.equal(unknown.status, 1)
assert.match(unknown.stderr, /Unknown argument/)

console.log('Supabase Phase 8 closeout tests passed.')
