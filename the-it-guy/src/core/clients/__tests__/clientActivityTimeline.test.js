import { expect, test } from 'vitest'
import { activityDirection, filterActivity, groupActivity } from '../clientActivityTimeline'
const event = { id: 'one', occurred_at: '2026-10-09T10:00:00Z', title: 'Appointment scheduled', category: 'appointment', actor_kind: 'staff' }

test('date and text filters intersect with the view without guessing a contact direction', () => {
  expect(activityDirection(event)).toBe('internal')
  expect(filterActivity([event], { view: 'incoming' })).toEqual([])
  expect(filterActivity([event], { view: 'work', search: 'scheduled', from: '2026-10-09', to: '2026-10-09' })).toEqual([event])
  expect(filterActivity([event], { from: '2026-10-10' })).toEqual([])
  expect(filterActivity([event], { to: '2026-10-08' })).toEqual([])
})

test('campaign grouping requires the exact recipient and never merges unrelated staff responses', () => {
  const sent = { ...event, event_type: 'campaign.sent', origin_table: 'email_campaign_recipients', origin_id: 'recipient-a' }
  const opened = { ...sent, id: 'open', event_type: 'campaign.opened', occurred_at: '2026-10-10T10:00:00Z' }
  const other = { ...sent, id: 'other', origin_id: 'recipient-b' }
  const response = { ...event, id: 'response', event_type: 'campaign.response', origin_table: 'agency_client_campaign_responses', origin_id: 'response-a' }
  const groups = groupActivity([sent, opened, other, response])
  expect(groups).toHaveLength(3)
  expect(groups[0].events.map(row => row.id)).toEqual(['open', 'one'])
  expect(activityDirection(response)).toBe('incoming')
  expect(activityDirection(opened)).toBe('outgoing')
})
