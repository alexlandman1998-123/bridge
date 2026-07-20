import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflowService = readFileSync(
  new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url),
  'utf8',
)
const permissionService = readFileSync(
  new URL('../src/services/permissions/attorneyPermissionService.js', import.meta.url),
  'utf8',
)
const workflowPanel = readFileSync(
  new URL('../src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx', import.meta.url),
  'utf8',
)
const dbGuardMigration = readFileSync(
  new URL('../../supabase/migrations/202607209904_attorney_workflow_transfer_controller_guard_phase4.sql', import.meta.url),
  'utf8',
)

assert.match(permissionService, /authorizingAssignmentId: attorneyAccess\?\.controllerAssignment\?\.id \|\| attorneyAccess\?\.assignment\?\.id \|\| null/)
assert.match(permissionService, /authorizingFirmId: attorneyAccess\?\.firmId \|\| membership\?\.firmId \|\| null/)
assert.match(permissionService, /permissionReason: attorneyAccess\?\.reason \|\| null/)

assert.match(workflowService, /function getAttorneyWorkflowAuditReasonLabel/)
assert.match(workflowService, /function buildAttorneyWorkflowAuditMetadata/)
assert.match(workflowService, /auditVersion: 'attorney_workflow_audit_v1'/)
assert.match(workflowService, /permissionReason/)
assert.match(workflowService, /permissionLabel/)
assert.match(workflowService, /authorizingAssignmentId/)
assert.match(workflowService, /authorizingFirmId/)
assert.match(workflowService, /metadata: auditMetadata/)
assert.match(workflowService, /permissionReason: auditMetadata\.permissionReason/)
assert.match(workflowService, /authorizationReason: item\.metadata\?\.permissionReason/)
assert.match(workflowService, /authorizationLabel: item\.metadata\?\.permissionLabel \|\| getAttorneyWorkflowAuditReasonLabel/)

assert.match(workflowPanel, /Activity & Audit Trail/)
assert.match(workflowPanel, /authorization context/)
assert.match(workflowPanel, /item\.authorizationReason/)
assert.match(workflowPanel, /item\.authorizationLabel/)

assert.match(dbGuardMigration, /'permissionReason', v_guard\.access_reason/)
assert.match(dbGuardMigration, /'authorizingAssignmentId', v_guard\.assignment_id/)
assert.match(dbGuardMigration, /'authorizingFirmId', v_guard\.firm_id/)

console.log('Attorney workflow audit trail Phase 5 contract passed.')
