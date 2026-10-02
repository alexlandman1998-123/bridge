// @vitest-environment jsdom
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ list: vi.fn(), checkIn: vi.fn(), update: vi.fn() }))
const event = { id: 'event-1', title: 'Parkhurst preview', address: '7 Sixth Street', publicToken: 'token-1', status: 'Completed', date: '23 Aug 2026', time: '10:00 – 13:00', listingId: 'listing-1', listing: { title: 'Parkhurst home', price: 2200000, bedrooms: 3 }, metadata: { visibility: 'public', listingSnapshot: { id: 'listing-1' } }, registrations: 24, attendees: 18, interestedLeads: 6, hostAgent: 'Test Agent', checklist: [{ label: 'Prepared', status: 'Completed' }, { label: 'Signs', status: 'Pending' }, { label: 'Reminders', status: 'Scheduled' }] }
vi.mock('../../../context/OrganisationContext', () => ({ useOrganisation: () => ({ organisation: { id: 'org-1' } }) }))
vi.mock('../../../lib/marketingEventStore', () => ({ useMarketingEvents: () => ({ events: [event], updateEvent: api.update }) }))
vi.mock('../../../services/marketingEventOperationsService', () => ({ listMarketingEventRsvps: api.list, checkInMarketingEventRsvp: api.checkIn, updateMarketingEventRsvpInterest: vi.fn(), processMarketingEventConversion: vi.fn() }))
import { ShowDayDetail } from '../ShowDays'
import { buildShowDayMetrics, getShowDayAction } from '../../../services/showDayWorkspaceModel'
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue([{ id: 'r1', full_name: 'Visitor One', status: 'confirmed', interest_level: 'high', crm_lead_id: 'lead-1', checked_in_at: null, submitted_at: '2026-08-20T10:00:00Z' }, { id: 'r2', full_name: 'Visitor Two', status: 'cancelled', checked_in_at: null }]); api.update.mockResolvedValue(event) })
const open = () => render(<MemoryRouter><ShowDayDetail showDayId="event-1" onBack={vi.fn()} /></MemoryRouter>)
it('uses one source for tab badges and five summary cards, including authoritative zero counts', async () => {
 open(); await waitFor(() => expect(screen.getByRole('tab', { name: 'Registrations 2' })).toBeTruthy())
 const stats = screen.getByRole('region', { name: 'Event results' })
 expect(stats.querySelectorAll('article')).toHaveLength(5)
 expect(stats.querySelector('article strong').textContent).toBe('2')
 expect(buildShowDayMetrics(event, []).registrations).toBe(0)
 expect(buildShowDayMetrics(event, []).attendanceRate).toBe('0%')
 expect(document.querySelector('.show-task-pending svg').classList.contains('lucide-circle')).toBe(true)
 expect(document.querySelector('.show-task-scheduled svg').classList.contains('lucide-clock-3')).toBe(true)
})
it('routes the main action to real leads, supports check-in and refreshes all counts', async () => {
 open(); await screen.findByRole('tab', { name: 'Registrations 2' }); fireEvent.click(screen.getByRole('button', { name: 'Follow up leads' }))
 expect(screen.getByRole('heading', { name: 'Leads & follow-up' })).toBeTruthy()
 expect(screen.getByRole('link', { name: 'Open CRM lead' }).getAttribute('href')).toBe('/pipeline/leads/lead-1')
 fireEvent.click(screen.getByRole('tab', { name: 'Attendees 0' }))
 api.list.mockResolvedValue([{ id: 'r1', full_name: 'Visitor One', status: 'confirmed', checked_in_at: '2026-08-23T08:00:00Z' }])
 fireEvent.click(screen.getByRole('button', { name: 'Check in' }))
 await waitFor(() => expect(api.checkIn).toHaveBeenCalledWith('r1', true))
 await screen.findByRole('tab', { name: 'Attendees 1' })
})
it('preserves event metadata while saving edits and keeps failure visible', async () => {
 open(); fireEvent.click(screen.getByRole('button', { name: 'Edit show day' }))
 const dialog = screen.getByRole('dialog'); fireEvent.change(within(dialog).getByLabelText('Event title'), { target: { value: 'Updated preview' } })
 fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
 await waitFor(() => expect(api.update).toHaveBeenCalledWith('event-1', expect.objectContaining({ title: 'Updated preview', metadata: expect.objectContaining({ visibility: 'public', listingSnapshot: { id: 'listing-1' }, hostName: 'Test Agent' }) })))
 await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
 fireEvent.click(screen.getByRole('button', { name: 'Edit show day' })); api.update.mockRejectedValue(new Error('Save failed'))
 fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); await screen.findByText('Save failed'); expect(screen.getByRole('dialog')).toBeTruthy()
})
it('selects promotion, check-in and follow-up at the right event stage', () => {
 const now = new Date('2026-10-02T10:00:00Z').getTime()
 expect(getShowDayAction({ status: 'Upcoming', startsAt: '2026-10-03T10:00:00Z' }, now).tab).toBe('promote')
 expect(getShowDayAction({ status: 'Upcoming', startsAt: '2026-10-02T09:00:00Z', endsAt: '2026-10-02T11:00:00Z' }, now).tab).toBe('attendees')
 expect(getShowDayAction({ status: 'Upcoming', endsAt: '2026-10-02T09:00:00Z' }, now).tab).toBe('leads')
 expect(getShowDayAction({ status: 'Draft', endsAt: '2026-09-02T09:00:00Z' }, now).tab).toBe('promote')
})
