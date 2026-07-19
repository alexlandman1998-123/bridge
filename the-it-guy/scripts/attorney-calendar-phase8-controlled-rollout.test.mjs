import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, '../supabase/migrations/202607180045_attorney_calendar_phase8_controlled_rollout.sql'), 'utf8')
const workspace = readFileSync(resolve(root, 'src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx'), 'utf8')
const serviceSource = readFileSync(resolve(root, 'src/services/attorneyCalendarRolloutService.js'), 'utf8')
const runbook = readFileSync(resolve(root, 'docs/attorney-calendar-phase8-controlled-rollout.md'), 'utf8')
const liveMode = process.argv.includes('--live')

for (const token of [
  'attorney_calendar_rollout_config',
  "('production', false, 0",
  'get_attorney_calendar_rollout_status',
  'record_attorney_calendar_rollout_event',
  'attorney_calendar_rollout_health',
  'rollbackRecommended',
  'minimum_sample_size',
]) {
  assert.ok(migration.includes(token), `Phase 8 migration should include ${token}`)
}

for (const token of [
  'getAttorneyCalendarRolloutStatus',
  'Create Invite is paused for this firm',
  'disabled={!inviteEnabled}',
]) {
  assert.ok(workspace.includes(token), `Phase 8 workspace should include ${token}`)
}

assert.ok(serviceSource.includes('ATTORNEY_CALENDAR_ROLLOUT_DISABLED'))
assert.ok(serviceSource.includes("client.rpc('get_attorney_calendar_rollout_status'"))
for (const token of ['0%', '5%', '25%', '50%', '100%', 'Rollback', 'Production activation requires explicit approval']) {
  assert.ok(runbook.includes(token), `Phase 8 runbook should include ${token}`)
}

if (!liveMode) {
  console.log('attorney calendar Phase 8 controlled rollout contract passed')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY
const demoEmail = process.env.ATTORNEY_DEMO_EMAIL || 'attorney.demo@bridgenine.co.za'
const demoPassword = process.env.ATTORNEY_DEMO_PASSWORD
assert.ok(url && serviceRoleKey && anonKey && demoPassword, 'Live Phase 8 certification credentials are required')

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const login = await actor.auth.signInWithPassword({ email: demoEmail, password: demoPassword })
assert.equal(login.error, null, `Attorney demo sign-in failed: ${login.error?.message || ''}`)
const actorId = login.data.user.id

const memberships = await service.from('attorney_firm_members').select('firm_id').eq('user_id', actorId).eq('status', 'active')
assert.equal(memberships.error, null)
assert.ok(memberships.data?.length, 'Attorney has no active firm membership')
const firmIds = memberships.data.map((row) => row.firm_id)
const assignmentFilter = firmIds.flatMap((firmId) => [`attorney_firm_id.eq.${firmId}`, `firm_id.eq.${firmId}`]).join(',')
const assignments = await service.from('transaction_attorney_assignments').select('transaction_id').or(assignmentFilter).limit(1)
assert.equal(assignments.error, null)
assert.ok(assignments.data?.[0]?.transaction_id, 'Attorney has no assigned matter')
const transactionId = assignments.data[0].transaction_id
const transaction = await service.from('transactions').select('id, organisation_id').eq('id', transactionId).single()
assert.equal(transaction.error, null)
const organisationId = transaction.data.organisation_id

const stagingStatus = await actor.rpc('get_attorney_calendar_rollout_status', {
  p_organisation_id: organisationId,
  p_environment: 'staging',
})
assert.equal(stagingStatus.error, null)
assert.equal(stagingStatus.data?.enabled, true, 'Staging should be enabled for certification')

const productionStatus = await actor.rpc('get_attorney_calendar_rollout_status', {
  p_organisation_id: organisationId,
  p_environment: 'production',
})
assert.equal(productionStatus.error, null)
assert.equal(productionStatus.data?.enabled, false, 'Production must remain disabled after Phase 8 implementation')
assert.equal(productionStatus.data?.rolloutPercentage, 0)

const since = new Date(Date.now() - 1000).toISOString()
const eventIds = []
try {
  for (let index = 0; index < 20; index += 1) {
    for (const eventType of ['invite_attempted', 'invite_created']) {
      const result = await actor.rpc('record_attorney_calendar_rollout_event', {
        p_environment: 'staging',
        p_organisation_id: organisationId,
        p_transaction_id: transactionId,
        p_appointment_id: null,
        p_event_type: eventType,
        p_metadata: { source: 'phase8_certification', sample: index },
      })
      assert.equal(result.error, null, `${eventType} telemetry failed: ${result.error?.message || ''}`)
      eventIds.push(result.data)
    }
  }

  const healthy = await service.rpc('attorney_calendar_rollout_health', { p_environment: 'staging', p_since: since })
  assert.equal(healthy.error, null)
  assert.equal(healthy.data?.rollbackRecommended, false)

  for (let index = 0; index < 2; index += 1) {
    const failed = await actor.rpc('record_attorney_calendar_rollout_event', {
      p_environment: 'staging',
      p_organisation_id: organisationId,
      p_transaction_id: transactionId,
      p_appointment_id: null,
      p_event_type: 'delivery_failed',
      p_metadata: { source: 'phase8_certification', sample: index },
    })
    assert.equal(failed.error, null)
    eventIds.push(failed.data)
  }

  const unhealthy = await service.rpc('attorney_calendar_rollout_health', { p_environment: 'staging', p_since: since })
  assert.equal(unhealthy.error, null)
  assert.equal(unhealthy.data?.rollbackRecommended, true)
  assert.ok(unhealthy.data?.rollbackReasons?.includes('delivery_failure_rate'))
} finally {
  if (eventIds.length) {
    const cleanup = await service.from('attorney_calendar_rollout_events').delete().in('event_id', eventIds)
    assert.equal(cleanup.error, null)
  }
  await actor.auth.signOut()
}

console.log(JSON.stringify({
  phase: 8,
  status: 'passed',
  stagingEnabled: true,
  productionEnabled: false,
  productionRolloutPercentage: 0,
  healthThresholdSimulation: 'passed',
  fixturesRemaining: 0,
}, null, 2))
