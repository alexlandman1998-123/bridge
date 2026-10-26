import { expect, it } from 'vitest'
import { campaignOutcomes } from '../campaignOutcomeModel'
it('counts a lead once using its latest recorded response and exact current CRM stage', () => {
  const response = '2026-10-25T12:00:00Z'
  const result = campaignOutcomes({ entries: [
    { lead_id: 'one', responded_at: '2026-10-20T12:00:00Z', ownerId: 'agent', lead: { stage: 'Old stage' }, lastContact: { activity_date: '2026-10-21T12:00:00Z' } },
    { lead_id: 'one', responded_at: response, ownerId: 'agent', lead: { stage: 'Valuation booked' }, lastContact: { activity_date: '2026-10-21T12:00:00Z' }, overdue: true },
    { lead_id: 'two', responded_at: response, ownerId: null, lead: { stage: 'Won' }, lastContact: { activity_date: '2026-10-25T13:00:00Z' } },
  ] })
  expect(result).toEqual({ enquiries: 2, contacted: 1, overdue: 1, unassigned: 1, stages: [{ name: 'Valuation booked', count: 1 }, { name: 'Won', count: 1 }] })
  expect(result.revenue).toBeUndefined()
})
it('retains unknown contact/task measures when their underlying sources are unavailable', () => {
  const result = campaignOutcomes({ entries: [{ lead_id: 'one', responded_at: '2026-10-25T12:00:00Z', lead: {} }], tasksAvailable: false, activitiesAvailable: false })
  expect(result).toMatchObject({ enquiries: 1, contacted: null, overdue: null, unassigned: 1, stages: [{ name: 'Stage not recorded', count: 1 }] })
})
