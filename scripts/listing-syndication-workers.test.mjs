import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { validateListingSyndicationJob } from '../the-it-guy/server/services/listingSyndicationWorkerService.js'

const listingId = '11111111-1111-4111-8111-111111111111'

test('sandbox syndication requires explicit approval evidence and provider switch', () => {
  const result = validateListingSyndicationJob({
    listingId,
    jobType: 'property24_publish',
    payload: {
      provider: 'property24',
      environment: 'sandbox',
      confirmation: `PROPERTY24_PUBLISH:${listingId}:sandbox`,
      approvedBy: '22222222-2222-4222-8222-222222222222',
      approvedAt: '2026-08-30T00:00:00.000Z',
    },
    env: { PROPERTY24_WORKER_ENABLED: 'true' },
  })
  assert.equal(result.provider, 'property24')
})

test('production syndication fails closed without the global production gate', () => {
  assert.throws(() => validateListingSyndicationJob({
    listingId,
    jobType: 'private_property_publish',
    payload: {
      provider: 'private_property',
      environment: 'production',
      confirmation: `PRIVATE_PROPERTY_PUBLISH:${listingId}:production`,
      approvedBy: '22222222-2222-4222-8222-222222222222',
      approvedAt: '2026-08-30T00:00:00.000Z',
    },
    env: { PRIVATE_PROPERTY_WORKER_ENABLED: 'true' },
  }), { code: 'PRODUCTION_SYNDICATION_DISABLED' })
})

test('worker and migration preserve layered activation controls', async () => {
  const [worker, migration, endpoint] = await Promise.all([
    readFile(new URL('../supabase/functions/listing-job-runner/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260830094921_listing_syndication_worker_controls.sql', import.meta.url), 'utf8'),
    readFile(new URL('../the-it-guy/api/internal/listing-syndication-worker.js', import.meta.url), 'utf8'),
  ])
  assert.match(worker, /LISTING_SYNDICATION_ADAPTER_URL/)
  assert.match(worker, /LISTING_SYNDICATION_WORKER_SECRET/)
  assert.match(migration, /bridge_is_org_admin/)
  assert.match(migration, /Exact listing syndication confirmation is required/)
  assert.match(endpoint, /x-listing-syndication-worker-secret/)
})
