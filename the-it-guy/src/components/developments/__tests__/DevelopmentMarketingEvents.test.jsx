// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DevelopmentMarketingEvents from '../DevelopmentMarketingEvents'

afterEach(cleanup)
const now = Date.parse('2026-10-09T10:00:00Z')
const events = [
  { id: 'old', title: 'First launch', eventType: 'launch', status: 'completed', startsAt: '2026-09-01T09:00:00Z', createdBy: 'agent-auth-id', location: 'Sales centre' },
  { id: 'recent', title: 'Last show day', eventType: 'show_day', status: 'upcoming', startsAt: '2026-10-01T09:00:00Z' },
  { id: 'next', title: 'Next show day', eventType: 'show_day', status: 'upcoming', startsAt: '2026-10-11T09:00:00Z', createdBy: 'agent-auth-id' },
  { id: 'running', title: 'Launch in progress', eventType: 'launch', status: 'upcoming', startsAt: '2026-10-09T09:00:00Z', endsAt: '2026-10-09T12:00:00Z' },
  { id: 'cancelled', title: 'Cancelled launch', eventType: 'launch', status: 'cancelled', startsAt: '2026-10-12T09:00:00Z' },
]

it('separates upcoming events from history, respects end times and resolves the organising agent', () => {
  render(<DevelopmentMarketingEvents now={now} events={events} organisationUsers={[{ id: 'membership-id', userId: 'agent-auth-id', fullName: 'Alex Agent' }]} />)
  const upcoming = screen.getByRole('region', { name: 'Upcoming events' })
  const history = screen.getByRole('region', { name: 'Past events' })
  expect(within(upcoming).getAllByRole('heading', { level: 5 }).map(heading => heading.textContent)).toEqual(['Launch in progress', 'Next show day'])
  expect(within(history).getAllByRole('heading', { level: 5 }).map(heading => heading.textContent)).toEqual(['Cancelled launch', 'Last show day', 'First launch'])
  expect(within(history).getByText('Alex Agent')).toBeTruthy()
  expect(within(history).getAllByText('Agent not recorded')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /Create show day/ })).toBeNull()
})

it('opens the selected type and submits it without losing the form after a failed save', async () => {
  const create = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  render(<DevelopmentMarketingEvents canManage onCreate={create} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Create launch/ }))
  const dialog = screen.getByRole('dialog', { name: 'Create launch' })
  fireEvent.change(within(dialog).getByLabelText('Event title'), { target: { value: 'Opening evening' } })
  fireEvent.change(within(dialog).getByLabelText('Date and time'), { target: { value: '2026-10-20T18:00' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create launch' }))
  await screen.findByRole('alert')
  expect(within(dialog).getByLabelText('Event title').value).toBe('Opening evening')
  expect(create).toHaveBeenCalledWith({ eventType: 'launch', title: 'Opening evening', startsAt: '2026-10-20T18:00', location: '', description: '' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create launch' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: /Create show day/ }))
  expect(screen.getByRole('dialog', { name: 'Create show day' })).toBeTruthy()
  expect(screen.getByLabelText('Event title').value).toBe('')
})
