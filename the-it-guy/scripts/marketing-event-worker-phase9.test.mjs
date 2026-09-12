import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const worker = await readFile(new URL('../../supabase/functions/marketing-event-worker/index.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/migrations/20260911152751_marketing_event_operations_hardening_phase9.sql', import.meta.url), 'utf8')
const operations = await readFile(new URL('../src/services/marketingEventOperationsService.js', import.meta.url), 'utf8')

for (const marker of ['MAX_ATTEMPTS = 3', 'recoverStaleClaims', 'nextAttemptAt', 'next_attempt_at', 'failed_at', 'retried']) {
  assert.match(worker, new RegExp(marker), `worker should include ${marker}`)
}

for (const marker of ['marketing_event_operations_summary', 'security_invoker = true', 'marketing_event_rsvp_handoffs_retry_queue_idx', 'marketing_event_rsvp_messages_retry_queue_idx']) {
  assert.match(migration, new RegExp(marker), `migration should include ${marker}`)
}

for (const marker of ['getMarketingEventOperations', 'retryMarketingEventOperation', 'marketing_event_operations_summary']) {
  assert.match(operations, new RegExp(marker), `operations service should include ${marker}`)
}

console.log('marketing event worker phase 9 checks passed')
