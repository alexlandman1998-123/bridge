import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  classifySupabaseRequest,
  createQueryBaselineController,
  installRealtimeChannelBaseline,
  normalizeRoute,
} from '../src/services/observability/queryBaselineTelemetry.js'

test('classifies resources without retaining URL filters or values', () => {
  assert.deepEqual(
    classifySupabaseRequest('https://example.supabase.co/rest/v1/offers?lead_id=secret-value&select=*'),
    { kind: 'rest', resource: 'offers', excluded: false },
  )
  assert.deepEqual(
    classifySupabaseRequest('https://example.supabase.co/rest/v1/rpc/list_notifications?private=value'),
    { kind: 'rpc', resource: 'list_notifications', excluded: false },
  )
  assert.equal(classifySupabaseRequest('https://example.supabase.co/rest/v1/performance_metrics').excluded, true)
  assert.equal(normalizeRoute('/agency/leads/7186d62c-5baf-4540-924a-8be1d2b707b2'), '/agency/leads/:id')
  assert.equal(normalizeRoute('/accept-invite/aSensitiveOpaqueToken123'), '/accept-invite/:token')
})

test('aggregates route-load, idle, latency, errors, and schema failures', async () => {
  let clock = 0
  const windows = []
  const controller = createQueryBaselineController({
    now: () => clock,
    getRoute: () => '/agency/pipeline',
    getVisibility: () => 'visible',
    onWindow: (summary) => windows.push(summary),
  })

  await controller.observeFetch('https://example.supabase.co/rest/v1/offers?lead_id=private', {}, async () => {
    clock += 20
    return new Response('{}', { status: 200 })
  })
  clock = 20_000
  await controller.observeFetch('https://example.supabase.co/rest/v1/profiles?select=name', {}, async () => {
    clock += 80
    return new Response(JSON.stringify({ code: '42703', message: 'column does not exist' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  })

  const summary = controller.flush()
  assert.equal(summary.requestCount, 2)
  assert.equal(summary.routeLoadRequests, 1)
  assert.equal(summary.idleRequests, 1)
  assert.equal(summary.errorCount, 1)
  assert.equal(summary.schemaErrorCount, 1)
  assert.equal(summary.requestP50Ms, 20)
  assert.equal(summary.requestP95Ms, 80)
  assert.deepEqual(summary.topResources, [
    { resource: 'rest:offers', count: 1 },
    { resource: 'rest:profiles', count: 1 },
  ])
  assert.equal(windows.length, 1)
  assert.doesNotMatch(JSON.stringify(summary), /private|lead_id|column does not exist/)
})

test('observability writes are excluded from the aggregate', async () => {
  let clock = 0
  const controller = createQueryBaselineController({ now: () => clock })
  await controller.observeFetch('https://example.supabase.co/rest/v1/performance_metrics', { method: 'POST' }, async () => {
    clock += 5
    return new Response('{}', { status: 201 })
  })
  assert.equal(controller.snapshot().requestCount, 0)
})

test('tracks realtime channels across unsubscribe and removeChannel', async () => {
  const channels = []
  const client = {
    channel(name) {
      const channel = { name, unsubscribe: async () => 'ok' }
      channels.push(channel)
      return channel
    },
    async removeChannel() {
      return 'ok'
    },
  }
  const controller = createQueryBaselineController()
  installRealtimeChannelBaseline(client, controller)
  const first = client.channel('private:one')
  const second = client.channel('private:two')
  assert.equal(controller.snapshot().activeRealtimeChannels, 2)
  assert.equal(controller.snapshot().peakRealtimeChannels, 2)
  await first.unsubscribe()
  assert.equal(controller.snapshot().activeRealtimeChannels, 1)
  await client.removeChannel(second)
  assert.equal(controller.snapshot().activeRealtimeChannels, 0)
  assert.equal(controller.snapshot().peakRealtimeChannels, 2)
})

test('database snapshots omit SQL text and remain service-role only', async () => {
  const migration = await readFile(
    new URL('../../supabase/migrations/20260827211317_query_baseline_database_snapshots_phase0.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /grant execute on function public\.capture_query_baseline_database_snapshot\(\) to service_role/i)
  assert.match(migration, /revoke all on function .* from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]*?'query'/i)
  assert.doesNotMatch(migration, /ranked\.query\b/i)
})
