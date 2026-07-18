import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerDocumentReleaseReadinessReport } from '../src/lib/sellerDocumentReleaseReadiness.js'

const healthySnapshot = {
  organisation_id: 'organisation-1',
  listing_id: 'listing-1',
  dependencies_ready: true,
  missing_automations: [],
  heartbeat_fresh: true,
  last_live_heartbeat_at: '2026-07-17T11:30:00Z',
  heartbeat_age_minutes: 30,
  operational_blocking_count: 0,
  operational_attention_count: 0,
  continuity_blocking_count: 0,
  continuity_attention_count: 0,
  sla_blocking_count: 0,
  sla_attention_count: 0,
  failed_notification_count: 0,
}

const healthy = buildSellerDocumentReleaseReadinessReport(healthySnapshot, { now: new Date('2026-07-17T12:00:00Z') })
assert.equal(healthy.version, 'seller_document_release_readiness_p1_10_v1')
assert.equal(healthy.gate.status, 'pass')
assert.equal(healthy.gate.releaseRecommended, true)
assert.equal(healthy.summary.blockingCount, 0)

const warning = buildSellerDocumentReleaseReadinessReport({ ...healthySnapshot, sla_attention_count: 2 })
assert.equal(warning.gate.status, 'warning')
assert.equal(warning.gate.strictReleaseRecommended, false)

const blocked = buildSellerDocumentReleaseReadinessReport({
  ...healthySnapshot,
  dependencies_ready: false,
  heartbeat_fresh: false,
  missing_automations: ['seller_document_requested'],
  operational_blocking_count: 2,
  continuity_blocking_count: 1,
  sla_blocking_count: 1,
  failed_notification_count: 1,
})
assert.equal(blocked.gate.status, 'blocked')
assert.equal(blocked.summary.blockingCount, 8)
assert.ok(blocked.actions.some((action) => action.includes('P0-1 through P1-10')))
assert.ok(blocked.actions.some((action) => action.includes('heartbeat')))

const migration = await readFile(new URL('../../supabase/migrations/202607170015_seller_document_release_readiness_p1_10.sql', import.meta.url), 'utf8')
for (const marker of [
  'seller_document_automation_heartbeats',
  'seller_document_rollout_controls',
  'seller_document_rollout_audit',
  'bridge_record_seller_document_automation_heartbeat_p1_10',
  'bridge_seller_document_release_snapshot_p1_10',
  'bridge_set_seller_document_rollout_p1_10',
  'bridge_certify_seller_document_canary_p1_10',
  "mode in ('paused','canary','enabled')",
  "interval '2 hours'",
  "interval '24 hours'",
  "case when p_mode = 'canary' then p_canary_listing_id else null end",
  'Rollout revision conflict',
  'service_role',
  'security definer',
  'bridge_is_active_member',
]) assert.ok(migration.includes(marker), `P1-10 migration must include ${marker}`)

const dispatcher = await readFile(new URL('../../supabase/functions/send-email/handlers/notificationReminderDispatch.ts', import.meta.url), 'utf8')
assert.match(dispatcher, /bridge_record_seller_document_automation_heartbeat_p1_10/)
assert.match(dispatcher, /heartbeatUnavailable/)

const cli = await readFile(new URL('./certify-seller-document-release.mjs', import.meta.url), 'utf8')
for (const marker of ['--organisation-id', '--listing-id', '--strict', '--set-mode', '--certify-canary', '--expected-revision', '--confirm-rollout-change']) {
  assert.ok(cli.includes(marker), `P1-10 CLI must include ${marker}`)
}

console.log('seller document release readiness P1-10 tests passed')
