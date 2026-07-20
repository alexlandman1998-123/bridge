import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607209904_attorney_workflow_transfer_controller_guard_phase4.sql', import.meta.url),
  'utf8',
)
const workflowService = readFileSync(
  new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url),
  'utf8',
)

assert.match(migration, /create or replace function public\.bridge_attorney_assignment_covers_workflow_lane/)
assert.match(migration, /create or replace function public\.bridge_attorney_member_can_edit_workflow_lane/)
assert.match(migration, /create or replace function public\.bridge_resolve_attorney_workflow_lane_guard/)
assert.match(migration, /create or replace function public\.bridge_update_attorney_workflow_step/)

assert.match(migration, /bridge_attorney_assignment_covers_workflow_lane\(\s*assignment\.attorney_role,\s*assignment\.assignment_type,\s*v_lane_key/s)
assert.match(migration, /assignment\.can_update_workflow_lane is not false/)
assert.match(migration, /assignment\.is_primary is not false/)
assert.match(migration, /assignment\.attorney_user_id = p_actor_id[\s\S]*assignment\.primary_attorney_id = p_actor_id/)
assert.doesNotMatch(migration, /assignment\.secretary_id = p_actor_id[\s\S]*access_reason text/)
assert.doesNotMatch(migration, /assignment\.admin_handler_id = p_actor_id[\s\S]*access_reason text/)

assert.match(migration, /if v_lane_key <> 'transfer' then[\s\S]*'transfer_attorney_controller'::text/)
assert.match(migration, /bridge_attorney_assignment_covers_workflow_lane\([\s\S]*'transfer'[\s\S]*\)/)
assert.match(migration, /bridge_attorney_member_can_edit_workflow_lane\([\s\S]*p_actor_id,[\s\S]*'transfer'[\s\S]*\)/)

assert.match(migration, /firm\.allow_management_lane_override = true/)
assert.match(migration, /bridge_normalize_attorney_professional_role\(member\.professional_role\) in \('firm_admin', 'director_partner'\)/)
assert.match(migration, /'management_override'::text/)

assert.match(migration, /'permissionReason', v_guard\.access_reason/)
assert.match(migration, /'authorizingAssignmentId', v_guard\.assignment_id/)
assert.match(migration, /'authorizingFirmId', v_guard\.firm_id/)
assert.match(migration, /grant execute on function public\.bridge_update_attorney_workflow_step/)
assert.match(workflowService, /client\.rpc\('bridge_update_attorney_workflow_step'/)

console.log('Attorney workflow transfer-controller DB guard Phase 4 contract passed.')
