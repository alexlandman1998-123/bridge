import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const repositoryRoot = path.resolve(root, '..')
const read = (relativePath, base = root) => readFileSync(path.join(base, relativePath), 'utf8')

const migration = read('supabase/migrations/202607180042_attorney_role_release_certification_phase9.sql', repositoryRoot)
const releaseService = read('src/services/attorneyRoleReleaseService.js')
const settings = read('src/lib/settingsApi.js')

assert.match(migration, /attorney_firm_members_compatibility_role_derived_phase9/)
assert.match(migration, /attorney_firm_invitations_compatibility_role_derived_phase9/)
assert.match(migration, /\) not valid;/i)
assert.match(migration, /create table if not exists public\.attorney_role_release_certifications/)
assert.match(migration, /certify_attorney_role_release_phase9/)
assert.match(migration, /attorney_user_is_firm_admin\(target_firm_id\)/)
assert.match(migration, /from public\.attorney_role_integrity_v1/)
assert.match(migration, /integrity_status <> 'healthy'/)
assert.match(migration, /compatibility_columns_removed', false/)
assert.doesNotMatch(migration, /drop column|delete from public\.attorney|truncate/i)

assert.match(releaseService, /buildAttorneyRoleReleaseDecision/)
assert.match(releaseService, /!decision\.ready \|\| !confirm/)
assert.match(releaseService, /dryRun: true/)
assert.match(releaseService, /client\.rpc\('certify_attorney_role_release_phase9'/)
assert.match(settings, /const role = isAttorneyWorkspace \? attorneyProfile\.professionalRole : genericRole/)

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const release = await server.ssrLoadModule('/src/services/attorneyRoleReleaseService.js')

  const ready = release.buildAttorneyRoleReleaseDecision({
    summary: { rowCount: 4, blockingCount: 0 },
    gate: { status: 'pass', releaseRecommended: true, reason: 'Passed.' },
  })
  assert.equal(ready.ready, true)
  assert.equal(ready.status, 'ready_for_certification')
  assert.equal(ready.compatibilityColumnsRemoved, false)

  const blocked = release.buildAttorneyRoleReleaseDecision({
    summary: { rowCount: 4, blockingCount: 1 },
    gate: { status: 'blocked', releaseRecommended: false, reason: 'One mismatch.' },
  })
  assert.equal(blocked.ready, false)
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.reason, 'One mismatch.')

  const empty = release.buildAttorneyRoleReleaseDecision({
    summary: { rowCount: 0, blockingCount: 0 },
    gate: { status: 'pass', releaseRecommended: true, reason: 'Unexpected empty pass.' },
  })
  assert.equal(empty.ready, false)

  console.log('Attorney role guarded release Phase 9 verification passed.')
} finally {
  await server.close()
}
