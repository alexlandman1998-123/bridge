import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const delegation = await server.ssrLoadModule('/src/services/attorneyLaneDelegationService.js')
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  const attribution = delegation.buildAttorneyDelegationAttribution({
    id: 'delegation-1', status: 'active', starts_at: new Date(Date.now() - 1000).toISOString(), expires_at: expiresAt,
    attorney_role: 'bond_attorney', responsible_firm_id: 'bond-firm-1', capabilities: ['workflow'],
  }, 'transfer-user-1')
  assert.deepEqual(attribution, {
    actualActorId: 'transfer-user-1', actingOnBehalf: true, delegationId: 'delegation-1',
    responsibleFirmId: 'bond-firm-1', delegatedAttorneyRole: 'bond_attorney',
  })
  assert.equal(delegation.buildAttorneyDelegationAttribution(null, 'bond-user-1').actingOnBehalf, false)

  const migration = readFileSync(new URL('../../supabase/migrations/20260906071644_attorney_coordination_propagation_phase4.sql', import.meta.url), 'utf8')
  for (const token of [
    'transaction_attorney_lane_updates',
    'transaction_attorney_lane_history',
    'transaction_events',
    'transaction_shared_progress',
    'transaction_activity_projections',
    'actualActorId',
    'actingOnBehalf',
    'delegationId',
    'responsibleFirmId',
    'delegatedAttorneyRole',
  ]) assert.ok(migration.includes(token), `Phase 4 propagation must include ${token}`)
  assert.match(migration, /item\.delegate_user_id = auth\.uid\(\)/)
  assert.match(migration, /item\.starts_at <= now\(\)[\s\S]*item\.expires_at > now\(\)/)
  assert.match(migration, /revoke all on function public\.bridge_current_attorney_action_attribution[\s\S]*from public, anon, authenticated/)
  assert.doesNotMatch(migration, /auth\.role\(\)/)

  const workflow = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  assert.match(workflow, /event_data: \{ \.\.\.eventData, attorneyActionAttribution: attribution \}/)
  const sharedProgress = readFileSync(new URL('../src/services/transactionSharedProgressService.js', import.meta.url), 'utf8')
  assert.match(sharedProgress, /attorneyActionAttribution: row\.attorney_action_attribution \|\| null/)

  const syncReadModel = readFileSync(new URL('../src/services/transactionSyncReadModelService.js', import.meta.url), 'utf8')
  assert.match(syncReadModel, /payload_json/, 'Canonical transaction sync must preserve canonical activity payloads')
  const clientFeed = readFileSync(new URL('../src/services/clientPortalActivityFeedService.js', import.meta.url), 'utf8')
  assert.match(clientFeed, /transactionSync/, 'Client and Televent activity feed must consume canonical transaction sync')

  console.log('Attorney coordination cross-module propagation Phase 4 gate passed.')
} finally {
  await server.close()
}
