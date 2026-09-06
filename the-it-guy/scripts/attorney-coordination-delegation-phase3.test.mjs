import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const delegation = await server.ssrLoadModule('/src/services/attorneyLaneDelegationService.js')
  const permissions = await server.ssrLoadModule('/src/services/permissions/attorneyPermissionService.js')

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const payload = delegation.buildAttorneyLaneDelegationInput({
    transactionId: 'tx-1', attorneyRole: 'cancellation', delegateUserId: 'transfer-1',
    capabilities: ['workflow', 'documents', 'workflow'], reason: 'Cover during leave', expiresAt,
  })
  assert.equal(payload.p_attorney_role, 'cancellation_attorney')
  assert.deepEqual(payload.p_capabilities, ['workflow', 'documents'])
  assert.ok(payload.p_starts_at)
  assert.throws(() => delegation.buildAttorneyLaneDelegationInput({
    transactionId: 'tx-1', attorneyRole: 'transfer', delegateUserId: 'transfer-1', capabilities: ['workflow'], reason: 'x', expiresAt,
  }), /bond and cancellation/i)
  assert.throws(() => delegation.buildAttorneyLaneDelegationInput({
    transactionId: 'tx-1', attorneyRole: 'bond', delegateUserId: 'transfer-1', capabilities: ['everything'], reason: 'x', expiresAt,
  }), /not supported/i)

  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { id: 'delegation-1' }, error: null } } }
  await delegation.grantAttorneyLaneDelegation({
    transactionId: 'tx-1', attorneyRole: 'bond', delegateUserId: 'transfer-1', capabilities: ['workflow'], reason: 'Capacity cover', expiresAt,
  }, { client })
  await delegation.revokeAttorneyLaneDelegation({ delegationId: 'delegation-1', reason: 'Cover ended' }, { client })
  assert.deepEqual(calls.map((call) => call.name), ['bridge_grant_attorney_lane_delegation', 'bridge_revoke_attorney_lane_delegation'])

  const membership = { isActive: true, professionalRole: 'attorney_conveyancer', practiceQualifications: ['transfer'] }
  const attorneyAccess = { canViewMatter: true, isAssignedParticipant: false, assignment: null }
  const activeDelegation = {
    id: 'delegation-1', status: 'active', starts_at: new Date(Date.now() - 1000).toISOString(), expires_at: expiresAt,
    capabilities: ['workflow', 'documents'],
  }
  const allowed = permissions.resolveAttorneyActionPermissions({
    appRole: 'attorney', membership, attorneyRole: 'bond_attorney', attorneyAccess, canViewAsAttorney: true, attorneyDelegation: activeDelegation,
  })
  assert.equal(allowed.actingOnBehalf, true)
  assert.equal(allowed.canUpdateLane, true)
  assert.equal(allowed.canRequestDocuments, true)
  assert.equal(allowed.canAddInternalNote, false)
  assert.equal(allowed.canAddSharedUpdate, false)

  const expired = permissions.resolveAttorneyActionPermissions({
    appRole: 'attorney', membership, attorneyRole: 'bond_attorney', attorneyAccess, canViewAsAttorney: true,
    attorneyDelegation: { ...activeDelegation, expires_at: new Date(Date.now() - 1000).toISOString() },
  })
  assert.equal(expired.hasLaneAuthority, false)
  assert.equal(expired.canUpdateLane, false)

  const migration = readFileSync(new URL('../../supabase/migrations/20260906070938_attorney_lane_delegation_phase3.sql', import.meta.url), 'utf8')
  assert.match(migration, /attorney_role in \('bond_attorney', 'cancellation_attorney'\)/)
  assert.match(migration, /delegate_user_id <> granted_by/)
  assert.match(migration, /expires_at <= starts_at \+ interval '30 days'/)
  assert.match(migration, /delegation\.starts_at <= now\(\) and delegation\.expires_at > now\(\)/)
  assert.match(migration, /v_capability = any\(delegation\.capabilities\)/)
  assert.match(migration, /Delegation cannot exceed the responsible lane assignment capabilities/)
  assert.match(migration, /when 'workflow' then coalesce\(owner_assignment\.can_update_workflow_lane, true\)/)
  assert.match(migration, /revoke all on function public\.bridge_grant_attorney_lane_delegation[\s\S]*from public, anon/)
  assert.doesNotMatch(migration, /auth\.role\(\)/)

  const panel = readFileSync(new URL('../src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx', import.meta.url), 'utf8')
  assert.match(panel, /Acting on behalf of the responsible/)
  assert.match(panel, /access is limited to/)
  assert.match(panel, /expires/)

  console.log('Attorney coordination controlled delegation Phase 3 gate passed.')
} finally {
  await server.close()
}
