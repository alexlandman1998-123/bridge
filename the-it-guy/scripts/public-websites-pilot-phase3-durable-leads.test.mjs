import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260906093524_public_websites_durable_lead_dispatch.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_durable_lead_dispatch_test.sql'))
const worker = read(resolve(repositoryRoot, 'supabase/functions/website-lead-dispatcher/index.ts'))
const workerLock = read(resolve(repositoryRoot, 'supabase/functions/website-lead-dispatcher/deno.lock'))
const helper = read(resolve(repositoryRoot, 'supabase/functions/_shared/websiteLeadDispatch.ts'))
const route = read(resolve(repositoryRoot, 'apps/websites/app/api/leads/route.ts'))
const config = read(resolve(repositoryRoot, 'supabase/config.toml'))

for (const [pattern, message] of [
  [/website_claim_lead_notifications[\s\S]*for update skip locked/i, 'atomically claims due outbox events'],
  [/dispatch_attempt_count = event\.dispatch_attempt_count \+ 1/i, 'increments every claimed delivery attempt'],
  [/next_dispatch_attempt_at = v_next_attempt/i, 'persists bounded retry timing'],
  [/website_reset_stale_lead_notification_claims/i, 'recovers interrupted worker claims'],
  [/arch9-website-lead-dispatcher-1m/i, 'schedules the queue worker every minute'],
  [/vault\.decrypted_secrets/i, 'keeps scheduler credentials in Vault'],
  [/revoke all on function public\.website_claim_lead_notifications[\s\S]*from public, anon, authenticated/i, 'keeps claims service-only'],
]) assert.match(migration, pattern, message)

assert.match(worker, /serviceRoleRequest/, 'worker requires the server credential')
assert.match(worker, /website_complete_lead_notification/, 'worker records provider outcomes')
assert.match(worker, /website_prepare_lead_notification_fallback/, 'worker retains the manager escalation path')
assert.match(worker, /shouldPrepareWebsiteLeadFallback/, 'worker escalates terminal agent delivery failures')
assert.match(worker, /website_reset_stale_lead_notification_claims/, 'worker resets stale claims before dispatch')
assert.match(worker, /website_claim_lead_notifications/, 'worker claims rather than scanning mutable rows')
assert.match(helper, /idempotencyKey/, 'provider delivery retains a stable idempotency key')
assert.match(route, /website-lead-dispatcher/, 'public capture kicks the durable worker')
assert.doesNotMatch(route, /functions\/v1\/send-email/, 'public capture no longer owns provider delivery')
assert.match(config, /\[functions\.website-lead-dispatcher\][\s\S]*verify_jwt = true/, 'function deployment verifies JWTs')
assert.match(workerLock, /@supabase\/supabase-js@2\.49\.9/, 'worker dependency graph is locked')
assert.match(databaseTest, /not has_function_privilege\('anon'/, 'database contract denies anonymous callers')
assert.match(databaseTest, /has_function_privilege\('service_role'/, 'database contract permits the worker')

console.log('Public websites pilot Phase 3 durable lead checks passed')
