// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../../../services/workspaceCalendarService', () => ({ loadWorkspaceMarketingCalendar: api.read }))
import WorkspaceCalendar from '../WorkspaceCalendar'
import { marketingCalendarRows, buildCalendarDayEvents } from '../agentCalendarDisplay'
afterEach(cleanup)
const days = [new Date('2026-10-25T22:00:00Z'), new Date('2026-10-26T22:00:00Z')]
const items = [
  { id: 'campaign:plan', type: 'campaign', campaignId: 'plan', title: 'Spring campaign', status: 'active', startDate: '2026-10-25', endDate: '2026-10-28' },
  { id: 'email:mail', type: 'email', sourceId: 'mail', title: 'October email', status: 'scheduled', startDate: '2026-10-26', endDate: '2026-10-26', scheduledFor: '2026-10-26T08:00:00Z' },
]
const props = () => ({ organisationId: 'org', viewerKey: 'user', appointments: [{ appointmentId: 'plan', title: 'Buyer viewing', appointmentType: 'viewing', dateTime: '2026-10-26T08:00:00Z', endDateTime: '2026-10-26T09:00:00Z', status: 'confirmed' }], days, cursorDate: days[0], view: 'week', onViewChange: vi.fn(), periodLabel: '26 – 27 October', onShift: vi.fn(), onToday: vi.fn(), onSelectDate: vi.fn(), onCreate: vi.fn(), onOpen: vi.fn(), agents: [], agentFilter: 'all', onAgentChange: vi.fn(), isPrincipal: true, historyView: 'work', onHistoryChange: vi.fn(), hasSnapshot: true, resolveListingLabel: () => '', resolveAgentName: () => '', appointmentLoad: { status: 'ready', hasSnapshot: true, error: '', reload: vi.fn() } })
function Location() { const location = useLocation(); return <output aria-label="Destination">{location.pathname + location.search}</output> }
function mount(changes = {}) { const p = { ...props(), ...changes }; return { p, ...render(<MemoryRouter><WorkspaceCalendar {...p} /><Location /></MemoryRouter>) } }
beforeEach(() => { api.read.mockReset().mockResolvedValue({ items, warnings: [] }) })
it('combines appointments and marketing without ID collisions, and filters each tab', async () => {
  const { p } = mount()
  expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
  await screen.findByText('3 events')
  expect(screen.getByRole('button', { name: /Buyer viewing, 10:00 to 11:00/ })).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /Campaign plan · Spring campaign/ })).toHaveLength(2)
  fireEvent.click(screen.getByRole('tab', { name: 'Appointments' }))
  expect(screen.queryByRole('button', { name: /October email/ })).toBeNull()
  expect(screen.getByText('1 appointment')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Buyer viewing, 10:00 to 11:00/ }))
  expect(p.onOpen).toHaveBeenCalledWith(p.appointments[0])
  fireEvent.click(screen.getByRole('tab', { name: 'Marketing' }))
  await screen.findByText('2 events')
  expect(screen.queryByRole('button', { name: /Buyer viewing,/ })).toBeNull()
  expect(screen.queryByLabelText('Calendar records')).toBeNull()
  expect(screen.queryByRole('button', { name: /Add appointment on/ })).toBeNull()
})
it('opens the saved marketing item without calling the appointment editor', async () => {
  const { p } = mount()
  const email = await screen.findByRole('button', { name: /Email · October email, 10:00, Scheduled/ })
  fireEvent.click(email)
  expect(screen.getByLabelText('Destination').textContent).toBe('/marketing?section=email&view=detail&id=mail')
  expect(p.onOpen).not.toHaveBeenCalled()
})
it('supports keyboard tabs, status filtering and existing date navigation', async () => {
  const { p } = mount()
  await screen.findByText('3 events')
  fireEvent.keyDown(screen.getByRole('tab', { name: 'All' }), { key: 'End' })
  await screen.findByText('2 events')
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Marketing' }))
  fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'Scheduled' } })
  expect(screen.getByText('1 event')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next period' })); expect(p.onShift).toHaveBeenCalledWith(1)
  fireEvent.change(screen.getByLabelText('Calendar view'), { target: { value: 'agenda' } }); expect(p.onViewChange).toHaveBeenCalledWith('agenda')
})
it('keeps appointment data usable on partial marketing failure without claiming complete totals', async () => {
  api.read.mockResolvedValue({ items: [], warnings: ['Email could not be loaded.'] })
  mount()
  await screen.findByRole('alert')
  expect(screen.getByText('Counts unavailable')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Buyer viewing,/ })).toBeTruthy()
  expect(screen.queryByText('No events in this period')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Appointments' }))
  expect(screen.getByText('1 appointment')).toBeTruthy()
})
it('discards late responses and aborts table reads when the viewer or workspace changes', async () => {
  let resolveOld
  api.read.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValue({ items: [], warnings: [] })
  const p = props()
  const view = render(<MemoryRouter><WorkspaceCalendar {...p} /></MemoryRouter>)
  await waitFor(() => expect(api.read).toHaveBeenCalledTimes(1))
  const oldSignal = api.read.mock.calls[0][1].signal
  view.rerender(<MemoryRouter><WorkspaceCalendar {...p} organisationId="other-org" viewerKey="other-user" appointments={[]} /></MemoryRouter>)
  expect(oldSignal.aborted).toBe(true)
  await act(async () => resolveOld({ items, warnings: [] }))
  await waitFor(() => expect(api.read).toHaveBeenCalledWith('other-org', expect.any(Object)))
  expect(screen.queryByRole('button', { name: /October email/ })).toBeNull()
  view.unmount()
})
it.each(['day', 'three_day', 'week', 'month', 'agenda'])('renders both sources in %s view', async view => {
  mount({ view })
  await screen.findByText('3 events')
  expect(screen.getAllByRole('button', { name: /October email/ }).length).toBeGreaterThan(0)
  expect(screen.getAllByRole('button', { name: /Buyer viewing/ }).length).toBeGreaterThan(0)
})
it('preserves SAST points in time and clips ongoing plans without inventing a send duration', () => {
  const rows = marketingCalendarRows([...items, { id: 'campaign:ongoing', type: 'campaign', title: 'Ongoing', startDate: '2026-01-01' }], days)
  const events = buildCalendarDayEvents(rows, days)
  expect(events.get('2026-10-26').find(event => event.title.includes('October email'))).toMatchObject({ start: 600, end: 601, pointInTime: true, tone: 'marketing' })
  expect(events.get('2026-10-27').filter(event => event.allDay)).toHaveLength(2)
})

it('aborts an in-flight marketing read on unmount', async () => {
  api.read.mockImplementation(() => new Promise(() => {}))
  const view = mount()
  await waitFor(() => expect(api.read).toHaveBeenCalledTimes(1))
  const signal = api.read.mock.calls[0][1].signal
  view.unmount()
  expect(signal.aborted).toBe(true)
})

it('separates nearby marketing timestamps instead of painting them on top of each other', async () => {
  api.read.mockResolvedValue({ warnings: [], items: [...items, { ...items[1], id: 'email:second', sourceId: 'second', title: 'Second email', scheduledFor: '2026-10-26T08:05:00Z' }] })
  mount()
  const first = await screen.findByRole('button', { name: /Email · October email, 10:00, Scheduled/ })
  const second = screen.getByRole('button', { name: /Email · Second email, 10:05, Scheduled/ })
  expect(first.style.left).not.toBe(second.style.left)
  expect(Number(first.style.width.match(/[\d.]+/)[0])).toBeCloseTo(100 / 3, 3)
})

it('keeps routine focus events from reloading marketing metadata', async () => {
  mount()
  await screen.findByText('3 events')
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    }
  })
  expect(api.read).toHaveBeenCalledTimes(1)
})
