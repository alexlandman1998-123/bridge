import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_ACCOUNTS, DEMO_FLOWS, DEMO_SEED_MANIFEST } from '../demoManifest.js'

test('includes the Home Seekers demo profile and seed manifest', () => {
  const homeSeekers = DEMO_ACCOUNTS.find((account) => account.id === 'home-seekers')
  assert.ok(homeSeekers, 'Home Seekers demo account should be present')
  assert.equal(homeSeekers.name, 'Home Seekers')
  assert.deepEqual(homeSeekers.businessLines, ['sales', 'rentals'])
  assert.equal(homeSeekers.profile.companyName, 'Home Seekers')
  assert.equal(homeSeekers.seedData.seedKey, 'home-seekers-demo-seed-v1')
  assert.ok(homeSeekers.seedData.team.length >= 4)
  assert.ok(homeSeekers.seedData.listings.some((listing) => listing.title === '116 Ridge Road'))

  const manifest = DEMO_SEED_MANIFEST.find((row) => row.accountId === 'home-seekers')
  assert.ok(manifest, 'Home Seekers seed manifest should be present')
  assert.equal(manifest.status, 'ready')
  assert.match(manifest.summary, /agency demo seed/i)
  assert.ok(Array.isArray(manifest.sourceScripts))

  assert.ok(DEMO_FLOWS.some((flow) => flow.accountId === 'home-seekers'))
})
