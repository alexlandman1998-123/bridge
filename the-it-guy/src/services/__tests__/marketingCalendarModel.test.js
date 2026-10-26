import { expect, it } from 'vitest'
import {
  buildMarketingCalendar,
  matchesCalendarFilters,
  calendarDateKey,
  calendarItemsForDay,
  calendarMonthDays,
  shiftCalendarMonth,
  validCalendarDate,
} from '../marketingCalendarModel'
it('builds a Monday-first six-week grid and handles month ends and leap days', () => {
  const days = calendarMonthDays('2026-11-15')
  expect(days).toHaveLength(42)
  expect(days[0]).toBe('2026-10-26')
  expect(days[41]).toBe('2026-12-06')
  expect(shiftCalendarMonth('2024-01-31', 1)).toBe('2024-02-29')
  expect(shiftCalendarMonth('2026-01-31', 1)).toBe('2026-02-28')
  expect(validCalendarDate('2026-02-29')).toBe(false)
  expect(validCalendarDate('2024-02-29')).toBe(true)
})
it('plots campaign intervals inclusively, keeps ongoing plans open and leaves undated or invalid plans off the calendar', () => {
  const { items, undated } = buildMarketingCalendar({
    campaigns: [
      {
        id: 'bounded',
        name: 'Launch',
        start_date: '2026-10-24',
        end_date: '2026-10-26',
      },
      { id: 'ongoing', name: 'Keep connected', start_date: '2026-10-25' },
      { id: 'end', name: 'Deadline', end_date: '2026-10-30' },
      { id: 'undated', name: 'Later' },
      {
        id: 'invalid',
        name: 'Wrong dates',
        start_date: '2026-11-01',
        end_date: '2026-10-01',
      },
    ],
  })
  expect(undated.map((plan) => plan.id)).toEqual(['undated', 'invalid'])
  expect(
    calendarItemsForDay(items, '2026-10-24').map((item) => item.title),
  ).toEqual(['Launch'])
  expect(calendarItemsForDay(items, '2026-10-26')).toHaveLength(2)
  expect(
    calendarItemsForDay(items, '2026-10-27').map((item) => item.title),
  ).toEqual(['Keep connected'])
  expect(
    calendarItemsForDay(items, '2026-10-30').find(
      (item) => item.title === 'Deadline',
    ).endOnly,
  ).toBe(true)
})
it('uses South Africa time for actual scheduled emails and links only visible campaign records', () => {
  const { items } = buildMarketingCalendar({
    campaigns: [{ id: 'plan', name: 'Draft without dates' }],
    activities: [
      { channel: 'email', email_campaign_id: 'scheduled', campaign_id: 'plan' },
      {
        channel: 'email',
        email_campaign_id: 'private',
        campaign_id: 'hidden-plan',
      },
    ],
    channels: {
      email: {
        data: [
          {
            id: 'scheduled',
            name: 'Tomorrow morning',
            status: 'scheduled',
            scheduled_for: '2026-10-25T23:30:00Z',
          },
          {
            id: 'private',
            name: 'Visible email',
            status: 'scheduled',
            scheduled_for: '2026-10-26T08:00:00Z',
          },
          {
            id: 'draft',
            status: 'draft',
            scheduled_for: '2026-10-25T08:00:00Z',
          },
          { id: 'bad', status: 'scheduled', scheduled_for: 'invalid' },
          { id: 'sent', status: 'sent', scheduled_for: '2026-10-25T08:00:00Z' },
        ],
      },
    },
  })
  expect(items).toHaveLength(2)
  expect(items.find((item) => item.emailId === 'scheduled')).toMatchObject({
    startDate: '2026-10-26',
    endDate: '2026-10-26',
    campaignId: 'plan',
  })
  expect(
    items.find((item) => item.emailId === 'private').campaignId,
  ).toBeUndefined()
  const restricted = items.find((item) => item.emailId === 'private')
  expect(matchesCalendarFilters(restricted, { scope: 'standalone' })).toBe(false)
  expect(matchesCalendarFilters(restricted, { scope: 'linked' })).toBe(true)
  expect(calendarItemsForDay(items, '2026-10-25')).toHaveLength(0)
  expect(calendarDateKey('2026-10-25T23:30:00Z')).toBe('2026-10-26')
  expect(items.some((item) => item.type === 'automation')).toBe(false)
})
it('plots actual send/publication timestamps once and keeps drafts off the grid', () => {
  const scheduled = { id: 'wa', name: 'Reminder', status: 'queued', display_status: 'scheduled', scheduled_at: '2026-10-25T23:30:00Z' }
  const data = buildMarketingCalendar({ campaigns: [{ id: 'plan', name: 'Launch' }],
    activities: [{ channel: 'whatsapp', whatsapp_campaign_id: 'wa', campaign_id: 'plan' }],
    channels: {
      email: { data: [{ id: 'e', name: 'Sent email', status: 'sent', sent_at: '2026-10-25T09:00:00Z', scheduled_for: '2026-10-24T09:00:00Z' }] },
      whatsapp: { data: [scheduled, scheduled, { id: 'sent', status: 'sent', display_status: 'partial', sent_at: '2026-10-25T10:00:00Z' }, { id: 'draft', status: 'draft', scheduled_at: '2026-10-25T12:00:00Z' }] },
      posts: { data: [{ id: 'post', title: 'Published', listing_id: 'l', status: 'published', published_at: '2026-10-25T11:00:00Z' }, { id: 'draft', status: 'draft', created_at: '2026-10-25T10:00:00Z' }, { id: 'unknown', status: 'unknown', published_at: '2026-10-25T10:00:00Z' }] },
    },
  })
  expect(data.items).toHaveLength(4)
  expect(data.items.find((item) => item.type === 'whatsapp' && item.sourceId === 'wa')).toMatchObject({ startDate: '2026-10-26', campaignName: 'Launch', campaignId: 'plan', status: 'scheduled' })
  expect(data.items.find((item) => item.type === 'email').startDate).toBe('2026-10-25')
  expect(data.unscheduled.map((item) => item.id)).toEqual(['whatsapp:draft', 'post:draft', 'post:unknown'])
  expect(data.items.filter((item) => matchesCalendarFilters(item, { scope: 'standalone' }))).toHaveLength(3)
  expect(data.items.filter((item) => matchesCalendarFilters(item, { search: 'Launch', campaignId: 'plan' }))).toHaveLength(1)
  expect(data.items.filter((item) => matchesCalendarFilters(item, { type: 'post', status: 'published' }))).toHaveLength(1)
})
