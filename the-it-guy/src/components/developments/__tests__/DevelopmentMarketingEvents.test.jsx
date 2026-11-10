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
  expect(create).toHaveBeenCalledWith({ requestId: expect.any(String), eventType: 'launch', title: 'Opening evening', startsAt: '2026-10-20T18:00', location: '', description: '' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create launch' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: /Create show day/ }))
  expect(screen.getByRole('dialog', { name: 'Create show day' })).toBeTruthy()
  expect(screen.getByLabelText('Event title').value).toBe('')
})


it('submits a show day once while saving and closes only after success', async () => {
  let finish
  const create = vi.fn(() => new Promise(resolve => { finish = resolve }))
  render(<DevelopmentMarketingEvents canManage onCreate={create} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Create show day/ }))
  const dialog = screen.getByRole('dialog', { name: 'Create show day' })
  fireEvent.change(within(dialog).getByLabelText('Event title'), { target: { value: 'Sunday viewing' } })
  fireEvent.change(within(dialog).getByLabelText('Date and time'), { target: { value: '2026-11-15T10:00' } })
  const form = within(dialog).getByLabelText('Event title').closest('form')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.calls[0][0]).toMatchObject({ eventType: 'show_day', title: 'Sunday viewing' })
  expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  finish(true)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('shows loading and failed reads without claiming that the calendar is empty', () => {
  const retry = vi.fn()
  const view = render(<DevelopmentMarketingEvents loading onRetry={retry} />)
  expect(screen.getByRole('status').textContent).toContain('Loading development events')
  expect(screen.queryByText(/No upcoming events/)).toBeNull()
  view.rerender(<DevelopmentMarketingEvents loadError="Access denied" onRetry={retry} />)
  expect(screen.getByRole('alert').textContent).toContain('Access denied')
  expect(screen.queryByText(/No upcoming events/)).toBeNull()
  expect(screen.queryByText(/No past events/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading events' }))
  expect(retry).toHaveBeenCalledOnce()
})
it('keeps one request identity through a failed save and subsequent form edits', async () => {
  const create = vi.fn().mockRejectedValueOnce(Error('Response lost')).mockResolvedValueOnce(true)
  render(<DevelopmentMarketingEvents canManage onCreate={create} />)
  fireEvent.click(screen.getByRole('button', { name: /Create launch/ }))
  fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'Launch' } })
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-11-20T10:00' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create launch' }))
  await screen.findByText('Response lost')
  fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'Changed after retry' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create launch' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(create.mock.calls[0][0].requestId).toBe(create.mock.calls[1][0].requestId)
  fireEvent.click(screen.getByRole('button', { name: /Create launch/ }))
  fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'Second launch' } })
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-11-21T10:00' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create launch' }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(3))
  expect(create.mock.calls[2][0].requestId).not.toBe(create.mock.calls[0][0].requestId)
})
it('prepares only an active future event and passes its identity to campaigns',()=>{
 const prepare=vi.fn()
 render(<DevelopmentMarketingEvents events={events} now={now} canManage onPrepareCampaign={prepare} />)
 const buttons=screen.getAllByRole('button',{name:'Prepare invitation'})
 expect(buttons).toHaveLength(1)
 fireEvent.click(buttons[0])
 expect(prepare).toHaveBeenCalledWith(expect.objectContaining({id:'next'}))
})
