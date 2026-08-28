import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { resolveTransactionPollReason } from '../src/hooks/transactionLiveRefreshPolicy.js'
import { createSupabaseRequestCoordinator } from '../src/lib/supabaseRequestCoordinator.js'

test('concurrent identical PostgREST reads share one physical request', async () => {
  let fetchCalls = 0
  let releaseFetch
  const fetchImpl = async () => {
    fetchCalls += 1
    if (fetchCalls === 1) await new Promise((resolve) => { releaseFetch = resolve })
    return new Response(JSON.stringify([{ id: 1 }]), { status: 200 })
  }
  const coordinatedFetch = createSupabaseRequestCoordinator(fetchImpl)
  const url = 'https://example.supabase.co/rest/v1/organisations?id=eq.1&select=id'
  const first = coordinatedFetch(url, { headers: { Authorization: 'Bearer session-one' } })
  const second = coordinatedFetch(url, { headers: { Authorization: 'Bearer session-one' } })

  await Promise.resolve()
  assert.equal(fetchCalls, 1)
  releaseFetch()
  const [firstResponse, secondResponse] = await Promise.all([first, second])
  assert.notEqual(firstResponse, secondResponse)
  assert.deepEqual(await firstResponse.json(), [{ id: 1 }])
  assert.deepEqual(await secondResponse.json(), [{ id: 1 }])

  await coordinatedFetch(url, { headers: { Authorization: 'Bearer session-one' } })
  assert.equal(fetchCalls, 2, 'completed responses must not be cached')
})

test('mutations, distinct sessions, and abortable reads are never coalesced', async () => {
  let fetchCalls = 0
  const fetchImpl = async () => {
    fetchCalls += 1
    return new Response('{}', { status: 200 })
  }
  const coordinatedFetch = createSupabaseRequestCoordinator(fetchImpl)
  const url = 'https://example.supabase.co/rest/v1/profiles?select=id'

  await Promise.all([
    coordinatedFetch(url, { method: 'POST', body: '{}' }),
    coordinatedFetch(url, { method: 'POST', body: '{}' }),
  ])
  await Promise.all([
    coordinatedFetch(url, { headers: { Authorization: 'Bearer session-one' } }),
    coordinatedFetch(url, { headers: { Authorization: 'Bearer session-two' } }),
  ])
  const firstController = new AbortController()
  const secondController = new AbortController()
  await Promise.all([
    coordinatedFetch(url, { signal: firstController.signal }),
    coordinatedFetch(url, { signal: secondController.signal }),
  ])
  assert.equal(fetchCalls, 6)
})

test('polling becomes fallback-only with bounded Realtime reconciliation', () => {
  const base = {
    visibilityState: 'visible',
    now: 300_000,
    lastReconciliationAt: 0,
    reconciliationIntervalMs: 300_000,
  }
  assert.equal(resolveTransactionPollReason({ ...base, visibilityState: 'hidden', realtimeState: 'polling' }), null)
  assert.equal(resolveTransactionPollReason({ ...base, realtimeState: 'polling' }), 'poll_fallback')
  assert.equal(resolveTransactionPollReason({ ...base, realtimeState: 'connecting' }), 'poll_fallback')
  assert.equal(resolveTransactionPollReason({ ...base, realtimeState: 'live', now: 299_999 }), null)
  assert.equal(resolveTransactionPollReason({ ...base, realtimeState: 'live' }), 'poll_reconciliation')
})

test('the shared and scoped clients both use the coordinator and Realtime cleans up', async () => {
  const clientSource = await readFile(new URL('../src/lib/supabaseClient.js', import.meta.url), 'utf8')
  const hookSource = await readFile(new URL('../src/hooks/useTransactionLiveRefresh.js', import.meta.url), 'utf8')
  const publicationMigration = await readFile(
    new URL('../../supabase/migrations/20260827211323_enable_transaction_live_refresh_publication_phase2.sql', import.meta.url),
    'utf8',
  )
  assert.match(clientSource, /const coordinatedSupabaseFetch = createSupabaseRequestCoordinator/)
  assert.ok((clientSource.match(/fetch: coordinatedSupabaseFetch/g) || []).length >= 2)
  assert.match(hookSource, /\['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'\]\.includes\(status\)/)
  assert.match(hookSource, /void supabase\.removeChannel\(channel\)/)
  assert.match(hookSource, /reason === 'poll_reconciliation'/)
  assert.match(publicationMigration, /alter publication supabase_realtime add table public\.%I/)
  assert.match(publicationMigration, /transaction_shared_progress/)
  assert.match(publicationMigration, /notification_events/)
  assert.match(publicationMigration, /not exists/)
})
