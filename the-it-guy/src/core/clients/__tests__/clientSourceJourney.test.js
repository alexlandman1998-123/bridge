import { expect, test } from 'vitest'
import { sourceChannel, sourceName, hasTrackingTags, filterSourceTouches, sourceChannelCounts } from '../clientSourceJourney'

test('channel labels follow explicit source and medium evidence, and missing evidence stays unknown', () => {
  expect(sourceName({ utm_source: 'property24' })).toBe('Property24')
  expect(sourceName({ utm_source: 'revo_newsletter' })).toBe('Revo newsletter')
  expect(sourceChannel({ utm_source: 'instagram', utm_medium: 'paid_social' })).toBe('social')
  expect(sourceChannel({ utm_source: 'facebook', utm_medium: 'cpc' })).toBe('social')
  expect(sourceChannel({ utm_source: 'property24', utm_medium: 'referral' })).toBe('portal')
  expect(sourceChannel({ utm_medium: 'email' })).toBe('email')
  expect(sourceChannel({ utm_campaign: 'launch' })).toBe('unknown')
  expect(sourceChannel({})).toBe('unknown')
  expect(sourceName({})).toBe('Source not captured')
  expect(hasTrackingTags({ campaign_code: 'launch', source_channel: 'manual' })).toBe(false)
})

test('filters preserve original evidence and sort only loaded enquiries', () => {
  const rows = [
    { id: 'new', lead_id: 'b', utm_source: 'revo_newsletter', utm_campaign: 'launch', occurred_at: '2026-10-10T10:00:00Z' },
    { id: 'old', lead_id: 'a', source_channel: 'manual', occurred_at: '2026-10-09T10:00:00Z' },
  ]
  expect(filterSourceTouches(rows).map(row => row.id)).toEqual(['old', 'new'])
  expect(filterSourceTouches(rows, { order: 'recent' }).map(row => row.id)).toEqual(['new', 'old'])
  expect(filterSourceTouches(rows, { channel: 'email', search: 'newsletter', tracking: 'tagged' })).toEqual([rows[0]])
  expect(filterSourceTouches(rows, { tracking: 'untagged' })).toEqual([rows[1]])
  expect(rows.map(row => row.id)).toEqual(['new', 'old'])
  expect(sourceChannelCounts([...rows, { ...rows[0], id: 'duplicate' }]).find(channel => channel.key === 'email').count).toBe(1)
})
