import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAllowedDepartmentsForRole, normalizeInviteForRole } from '../src/components/attorney/onboarding/teamInviteUtils.js'

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')
const permissions = read('../src/lib/attorneyPermissions.js')
const legalPermissionService = read('../src/services/permissions/attorneyPermissionService.js')
const assignments = read('../src/services/transactionAttorneyAssignments.js')
const firms = read('../src/services/attorneyFirms.js')
const onboarding = read('../src/components/attorney/onboarding/attorneyOnboardingGuidance.js')
const departments = read('../src/components/attorney/onboarding/DepartmentsStep.jsx')
const migration = read('../../supabase/migrations/202607150015_attorney_three_role_persona_permissions_phase2.sql')
const baseline = read('../src/core/transactions/attorneyThreeRoleWorldClassBaseline.js')
const packageSource = read('../package.json')

const roleValues = permissions.match(/ATTORNEY_FIRM_ROLE_VALUES\s*=\s*\[([\s\S]*?)\]/)?.[1] || ''
const departmentTypes = permissions.match(/ATTORNEY_FIRM_DEPARTMENT_TYPES\s*=\s*\[([\s\S]*?)\]/)?.[1] || ''
const cancellationPermissions = permissions.match(/cancellation_attorney:\s*buildPermissionRecord\(\[([\s\S]*?)\]\)/)?.[1] || ''

assert.match(roleValues, /cancellation_attorney/)
assert.match(departmentTypes, /cancellation/)
assert.match(permissions, /can_view_cancellation_matters/)
assert.match(permissions, /can_edit_cancellation_workflow/)
assert.match(cancellationPermissions, /can_view_cancellation_matters/)
assert.match(cancellationPermissions, /can_edit_cancellation_workflow/)
assert.doesNotMatch(cancellationPermissions, /can_edit_transfer_workflow|can_edit_bond_workflow/)

assert.doesNotMatch(legalPermissionService, /PHASE_ONE_SHARED_WORKFLOW_EDITING/)
assert.match(legalPermissionService, /canUpdateLane:\s*canActOnLane/)
assert.match(legalPermissionService, /canRequestDocuments:\s*canActOnLane/)
assert.match(legalPermissionService, /canReviewDocuments:\s*canActOnLane/)
assert.match(legalPermissionService, /canManageSigning:\s*canActOnLane/)

assert.match(assignments, /CANCELLATION_PRIMARY_ROLES\s*=\s*new Set\(\['cancellation_attorney', 'director_partner', 'firm_admin'\]\)/)
assert.doesNotMatch(assignments, /CANCELLATION_PRIMARY_ROLES\s*=\s*new Set\(\['transfer_attorney'/)

assert.deepEqual(getAllowedDepartmentsForRole('cancellation_attorney', ['transfer', 'bond', 'cancellation', 'admin']), ['cancellation'])
assert.equal(
  normalizeInviteForRole({ role: 'cancellation_attorney', departmentType: 'transfer' }, ['transfer', 'cancellation']).departmentType,
  'cancellation',
)
assert.match(onboarding, /cancellation:\s*true/)
assert.match(departments, /Bond Cancellation Department/)
assert.match(firms, /set_attorney_firm_department_activation_v2/)
assert.match(firms, /bridge_complete_attorney_firm_onboarding_v3/)

for (const marker of [
  'attorney_firm_departments_department_type_check',
  'attorney_firm_members_role_check',
  'attorney_firm_invitations_role_check',
  'profiles_attorney_role_check',
  'set_attorney_firm_department_activation_v2',
  'bridge_complete_attorney_firm_onboarding_v3',
  'bridge_can_mutate_attorney_lane_phase2',
  'transaction_attorney_lane_history_write',
  'transaction_attorney_lane_updates_write',
  'attorney_workflow_blockers_write',
]) assert.match(migration, new RegExp(marker), `Phase 2 migration must contain ${marker}`)

assert.match(migration, /assignment\.attorney_role\s*=\s*target_attorney_role/)
assert.match(migration, /firm\.allow_management_lane_override/)
assert.match(migration, /assignment\.attorney_user_id\s*=\s*auth\.uid\(\)/)
assert.match(migration, /assignment\.primary_attorney_id\s*=\s*auth\.uid\(\)/)
assert.doesNotMatch(baseline, /cancellation_persona_missing|shared_lane_editing_enabled/)
assert.match(packageSource, /test:attorney-three-role-phase2/)

console.log('Attorney three-role Phase 2 persona and lane-isolation checks passed.')
