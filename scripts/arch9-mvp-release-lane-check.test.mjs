import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs/arch9-mvp-release-manifest.json'), 'utf8'))

function isAllowedPath(filePath) {
  return manifest.allowedPaths.includes(filePath)
    || manifest.allowedPathPrefixes.some((prefix) => filePath.startsWith(prefix))
}

assert.equal(isAllowedPath('the-it-guy/scripts/mvp-launch-readiness.mjs'), true)
assert.equal(isAllowedPath('scripts/arch9-mvp-release-lane-check.mjs'), true)
assert.equal(isAllowedPath('supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql'), true)
assert.equal(isAllowedPath('supabase/migrations/202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql'), false)
assert.equal(isAllowedPath('the-it-guy/src/services/attorneyOperations.js'), false)
assert.match('codex/arch9-mvp-release', new RegExp(manifest.releaseBranchPattern))
assert.doesNotMatch('main', new RegExp(manifest.releaseBranchPattern))
for (const requiredFile of manifest.requiredFiles) {
  if (existsSync(path.join(repoRoot, requiredFile))) continue
  assert.match(requiredFile, /^the-it-guy\/|^supabase\//)
}

console.log('Arch9 MVP release-lane manifest checks passed.')
