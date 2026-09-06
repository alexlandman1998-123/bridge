import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const delegation = await server.ssrLoadModule('/src/services/attorneyLaneDelegationService.js')
  assert.deepEqual(delegation.ATTORNEY_DELEGATION_CAPABILITIES, ['workflow', 'documents', 'internal_notes', 'shared_updates'])

  const panel = readFileSync(new URL('../src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx', import.meta.url), 'utf8')
  for (const copy of [
    'Delegate Actions',
    'Revoke Delegation',
    'Allowed actions',
    'Access expires',
    'They remain identified as the actual actor',
    'Revocation reason',
  ]) assert.ok(panel.includes(copy), `Phase 5 control surface should include: ${copy}`)
  assert.match(panel, /disabled=\{saving \|\| !delegationDraft\.reason\.trim\(\) \|\| !delegationDraft\.capabilities\.length/)
  assert.match(panel, /lane\.permissions\?\.canManageDelegation/)
  assert.match(panel, /lane\.delegationCandidate/)
  assert.match(panel, /grantAttorneyLaneDelegation/)
  assert.match(panel, /revokeAttorneyLaneDelegation/)

  const workflow = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  assert.match(workflow, /delegations: laneDelegations/)
  assert.match(workflow, /delegationCandidate: transferAssignment\?\.attorneyUserId/)
  assert.match(workflow, /canManageDelegation: Boolean\(permissionContext\?\.canManageDelegation\)/)

  const permission = readFileSync(new URL('../src/services/permissions/attorneyPermissionService.js', import.meta.url), 'utf8')
  assert.match(permission, /\['bond_attorney', 'cancellation_attorney'\]\.includes\(role\)/)
  assert.match(permission, /!actionPermissions\.actingOnBehalf/)
  assert.match(permission, /attorneyAccess\?\.isAssignedParticipant \|\| isFirmManagement/)

  console.log('Attorney coordination delegation management UX Phase 5 gate passed.')
} finally {
  await server.close()
}
