import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const repositoryRoot = path.resolve(root, '..')
const read = (relativePath, base = root) => readFileSync(path.join(base, relativePath), 'utf8')

const migration = read('supabase/migrations/202607180041_attorney_role_integrity_gate_phase8.sql', repositoryRoot)
const serviceSource = read('src/services/attorneyRoleIntegrityService.js')

assert.match(migration, /create or replace view public\.attorney_role_integrity_v1/)
assert.match(migration, /with \(security_invoker = true\)/)
assert.match(migration, /expected_compatibility_role/)
assert.match(migration, /ineligible_open_assignment_count/)
assert.match(migration, /missing_organisation_extension/)
assert.match(migration, /organisation_extension_mismatch/)
assert.match(migration, /grant select on public\.attorney_role_integrity_v1 to authenticated/)
assert.doesNotMatch(migration, /delete from|drop column|alter column.*drop/i)

assert.match(serviceSource, /ATTORNEY_ROLE_INTEGRITY_BLOCKING_STATUSES/)
assert.match(serviceSource, /releaseRecommended/)
assert.match(serviceSource, /dryRun: true/)
assert.match(serviceSource, /phase8_integrity_view_missing/)

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const integrity = await server.ssrLoadModule('/src/services/attorneyRoleIntegrityService.js')

  const healthy = integrity.buildAttorneyRoleIntegrityReport([
    { member_id: 'member-1', integrity_status: 'healthy', ineligible_open_assignment_count: 0 },
    { member_id: 'member-2', integrity_status: 'healthy', ineligible_open_assignment_count: 0 },
  ])
  assert.equal(healthy.gate.status, 'pass')
  assert.equal(healthy.gate.releaseRecommended, true)
  assert.equal(healthy.summary.blockingCount, 0)
  assert.equal(healthy.dryRun, true)

  const blocked = integrity.buildAttorneyRoleIntegrityReport([
    { member_id: 'member-1', integrity_status: 'compatibility_mismatch', ineligible_open_assignment_count: 0 },
    { member_id: 'member-2', integrity_status: 'ineligible_open_assignment', ineligible_open_assignment_count: 2 },
    { member_id: 'member-3', integrity_status: 'organisation_extension_mismatch', ineligible_open_assignment_count: 0 },
  ])
  assert.equal(blocked.gate.status, 'blocked')
  assert.equal(blocked.gate.releaseRecommended, false)
  assert.equal(blocked.summary.blockingCount, 3)
  assert.equal(blocked.summary.ineligibleAssignmentCount, 2)
  assert.equal(blocked.actions.length, 3)

  const empty = integrity.buildAttorneyRoleIntegrityReport([])
  assert.equal(empty.gate.status, 'blocked')
  assert.equal(empty.gate.releaseRecommended, false)

  console.log('Attorney role integrity gate Phase 8 verification passed.')
} finally {
  await server.close()
}
