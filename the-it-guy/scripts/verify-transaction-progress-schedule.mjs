#!/usr/bin/env node
import assert from 'node:assert/strict'

const args = process.argv.slice(2)

function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}

function hasFlag(name) {
  return args.includes(name)
}

const url = (option('--url') || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
const serviceRoleKey = (option('--service-role-key') || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const expectedProjectRef = (option('--expected-project-ref') || process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
const maxAgeMinutes = Math.max(5, Math.min(Number(option('--max-age-minutes') || 15) || 15, 60))

assert.ok(url, 'A Supabase URL is required.')
assert.ok(serviceRoleKey, 'A Supabase service-role key is required.')

const hostname = new URL(url).hostname
if (expectedProjectRef) {
  assert.equal(
    hostname,
    `${expectedProjectRef}.supabase.co`,
    `Refusing to verify ${hostname}; expected ${expectedProjectRef}.supabase.co.`,
  )
}

const response = await fetch(`${url}/rest/v1/rpc/bridge_transaction_progress_schedule_health_phase8`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_max_age_minutes: maxAgeMinutes }),
})

const health = await response.json().catch(() => null)
assert.ok(response.ok, `Schedule-health RPC failed with HTTP ${response.status}: ${health?.message || health?.error || 'unknown error'}`)
assert.ok(health && typeof health === 'object', 'Schedule-health RPC returned no result.')

const failures = []
if (health.healthy !== true) failures.push('scheduler health is not green')
if (Number(health.activeJobCount) !== 1) failures.push(`expected exactly one active job, found ${health.activeJobCount}`)
if (health.job?.name !== 'arch9-transaction-progress-recovery-5m') failures.push('canonical recovery job is not installed')
if (health.job?.schedule !== '*/5 * * * *') failures.push('canonical recovery job is not on the five-minute schedule')
if (!health.lastSuccessfulRunAt) failures.push('no successful recovery job run is recorded')
if (Number(health.recentRolloutRuns) < 1) failures.push('no matching recovery assurance run is recorded')
if (Array.isArray(health.duplicateTicks) && health.duplicateTicks.length > 0) failures.push('duplicate recovery invocations were detected')

if (hasFlag('--require-recovery-enabled')) {
  if (health.rollout?.autoRepairEnabled !== true) failures.push('automatic transaction-progress recovery is disabled')
  if (!['canary', 'full'].includes(String(health.rollout?.rolloutMode || ''))) failures.push('recovery rollout is not canary or full')
}

if (hasFlag('--require-notification-dispatch') && health.notificationDispatchEnabled !== true) {
  failures.push('notification dispatch is disabled')
}

const result = {
  healthy: health.healthy === true,
  activeJobCount: Number(health.activeJobCount || 0),
  job: health.job || null,
  lastSuccessfulRunAt: health.lastSuccessfulRunAt || null,
  recentRolloutRuns: Number(health.recentRolloutRuns || 0),
  duplicateTicks: Array.isArray(health.duplicateTicks) ? health.duplicateTicks : [],
  notificationDispatchEnabled: health.notificationDispatchEnabled === true,
  vaultProjectHost: health.vaultProjectHost || null,
  rollout: health.rollout || null,
}

console.log(JSON.stringify(result, null, 2))

assert.equal(failures.length, 0, `Transaction-progress schedule verification failed: ${failures.join('; ')}`)
