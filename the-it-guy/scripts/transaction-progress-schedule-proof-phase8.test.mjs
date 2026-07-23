import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile('../supabase/migrations/202607230010_transaction_progress_scheduler_proof_phase8.sql', 'utf8')
const verifier = await readFile('scripts/verify-transaction-progress-schedule.mjs', 'utf8')
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'))

assert.match(migration, /bridge_run_transaction_progress_schedule_phase8/i)
assert.match(migration, /bridge_transaction_progress_schedule_health_phase8/i)
assert.match(migration, /bridge_reconcile_transaction_progress_recovery_phase8/i)
assert.match(migration, /request\.jwt\.claim\.role.*service_role/i)
assert.match(migration, /bridge\.suppress_transaction_progress_notifications/i)
assert.match(migration, /notification_dispatch_enabled boolean not null default false/i)
assert.match(migration, /arch9-transaction-progress-recovery-5m/i)
assert.match(migration, /'\*\/5 \* \* \* \*'/)
assert.match(migration, /cron\.unschedule/i)
assert.match(migration, /duplicate_tick/i)
assert.match(migration, /current_setting\('bridge\.suppress_transaction_progress_notifications', true\)/i)
assert.match(migration, /Full rollout requires zero propagation gaps and three clean canary runs/i)

assert.equal(vercel.crons, undefined)
assert.match(verifier, /bridge_transaction_progress_schedule_health_phase8/)
assert.match(verifier, /expected exactly one active job/i)
assert.match(verifier, /duplicate recovery invocations/i)
assert.match(verifier, /--require-recovery-enabled/)
assert.match(verifier, /--require-notification-dispatch/)

console.log('Transaction progress Phase 8 scheduler proof, single-trigger, and recovery guard checks passed.')
