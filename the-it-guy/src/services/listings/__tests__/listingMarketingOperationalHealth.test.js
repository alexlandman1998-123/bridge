import assert from 'node:assert/strict'
import test from 'node:test'

import { buildListingMarketingOperationalHealth } from '../listingMarketingOperationalHealth.js'

const verifiedChannel = {
  key: 'property24',
  label: 'Property24',
  connected: true,
  live: true,
  actualStatus: 'active',
  reference: 'P24-TEST',
  publicUrl: 'https://example.test/listing',
  publicationState: { stage: 'verified', changeCount: 0 },
}

test('verified matching channels are healthy', () => {
  const report = buildListingMarketingOperationalHealth({ listingStatus: 'active', channels: [verifiedChannel] })
  assert.equal(report.status, 'healthy')
  assert.equal(report.issueCount, 0)
})

test('a withdrawn listing that remains live is a release hold', () => {
  const report = buildListingMarketingOperationalHealth({ listingStatus: 'withdrawn', channels: [verifiedChannel] })
  assert.equal(report.status, 'hold')
  assert.equal(report.issues[0].id, 'property24_withdrawal_drift')
})

test('failed withdrawal remains visible and actionable', () => {
  const report = buildListingMarketingOperationalHealth({ channels: [{
    ...verifiedChannel,
    live: false,
    actualStatus: 'inactive',
    publicationState: { stage: 'withdrawal_failed', failureDetail: 'Controlled portal failure' },
  }] })
  assert.equal(report.status, 'hold')
  assert.match(report.issues[0].detail, /Controlled portal failure/)
})

test('old accepted publication and missing public link produce watch findings', () => {
  const report = buildListingMarketingOperationalHealth({
    now: Date.parse('2026-09-26T12:00:00Z'),
    channels: [{ ...verifiedChannel, publicUrl: '', publicationState: { stage: 'accepted', acceptedAt: '2026-09-24T12:00:00Z' } }],
  })
  assert.equal(report.status, 'watch')
  assert.deepEqual(report.issues.map((issue) => issue.id), ['property24_missing_public_url', 'property24_publication_stuck'])
})

test('missing activity history blocks confidence for tracked channels only', () => {
  const tracked = buildListingMarketingOperationalHealth({ activityAvailable: false, channels: [verifiedChannel] })
  assert.equal(tracked.status, 'hold')
  assert.equal(tracked.issues[0].id, 'activity_monitoring_unavailable')

  const empty = buildListingMarketingOperationalHealth({ activityAvailable: false, channels: [] })
  assert.equal(empty.status, 'not_started')
})
