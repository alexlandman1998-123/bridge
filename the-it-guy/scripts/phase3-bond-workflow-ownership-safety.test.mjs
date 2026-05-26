import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const assignmentPath = path.join(root, 'src/services/bondAssignmentService.js')
const workflowOwnershipPath = path.join(root, 'src/services/bondFinanceWorkflowOwnershipService.js')
const queuePath = path.join(root, 'src/services/bondOperationalQueueService.js')
const resolverPath = path.join(root, 'src/auth/permissions/permissionResolver.js')
const migrationPath = path.join(root, '../supabase/migrations/202605250018_bond_application_assignment_phase2.sql')

const assignmentSource = fs.readFileSync(assignmentPath, 'utf8')
const workflowOwnershipSource = fs.readFileSync(workflowOwnershipPath, 'utf8')
const queueSource = fs.readFileSync(queuePath, 'utf8')
const resolverSource = fs.readFileSync(resolverPath, 'utf8')
const migrationSource = fs.readFileSync(migrationPath, 'utf8')

assert.match(assignmentSource, /resolveEffectiveBondAssignment/)
assert.match(assignmentSource, /assigned_bond_originator_email/)
assert.match(assignmentSource, /bond_originator/)
assert.match(assignmentSource, /resolveParticipantBondAssignment/)
assert.match(assignmentSource, /resolveRolePlayerBondAssignment/)
assert.match(assignmentSource, /resolveLegacyBondAssignment/)

assert.match(workflowOwnershipSource, /resolveFinanceWorkflowOwners/)
assert.match(workflowOwnershipSource, /canViewFinanceWorkflow/)
assert.match(workflowOwnershipSource, /canEditFinanceWorkflow/)
assert.match(workflowOwnershipSource, /canReviewFinanceCompliance/)

assert.match(queueSource, /resolveBondOperationalQueues/)
assert.match(queueSource, /processing_queue/)
assert.match(queueSource, /compliance_review/)
assert.match(queueSource, /manager_escalations/)

assert.match(resolverSource, /canAssignBondManager/)
assert.doesNotMatch(
  resolverSource,
  /role === ORG_ROLES\.compliance && can\(PERMISSIONS\.manageBondReporting, context\) return true/,
)

assert.doesNotMatch(migrationSource, /drop table/i)
assert.doesNotMatch(migrationSource, /drop column/i)
assert.doesNotMatch(migrationSource, /set not null/i)

console.log('Phase 3 bond workflow ownership safety test passed')
