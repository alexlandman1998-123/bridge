import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const sql = read('./sql/attorney-three-role-phase0-readiness.sql')
const permissionService = read('../src/services/permissions/attorneyPermissionService.js')
const memberRoles = read('../src/lib/attorneyPermissions.js')
const packageSource = read('../package.json')

assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i, 'readiness SQL must remain read-only')
for (const marker of [
  'required_transaction_count',
  'lane_count',
  'assignment_count',
  'role_player_count',
  'assignment_coverage_percent',
  'legal_role_migrations_applied',
  'legal_role_appointments_table_exists',
  'legal_role_assurance_view_exists',
]) {
  assert.match(sql, new RegExp(marker), `readiness SQL must report ${marker}`)
}

assert.doesNotMatch(permissionService, /PHASE_ONE_SHARED_WORKFLOW_EDITING/, 'the Phase 1 shared-lane compatibility switch must not return')
const firmRoleValues = memberRoles.match(/ATTORNEY_FIRM_ROLE_VALUES\s*=\s*\[([\s\S]*?)\]/)?.[1] || ''
const departmentTypes = memberRoles.match(/ATTORNEY_FIRM_DEPARTMENT_TYPES\s*=\s*\[([\s\S]*?)\]/)?.[1] || ''
assert.match(firmRoleValues, /cancellation_attorney/, 'cancellation attorney must remain a first-class firm role')
assert.match(departmentTypes, /cancellation/, 'cancellation must remain a first-class department type')
assert.match(packageSource, /test:attorney-three-role-phase0/)
assert.match(packageSource, /report:attorney-three-role-readiness/)

console.log('Attorney three-role Phase 0 enforcement checks passed.')
