// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AgentDashboard from '../AgentDashboard.jsx'
import { buildMobileToday } from '../../../services/mobileTodayModel.js'

const now = new Date('2026-10-06T10:00:00Z')
const profile = { id: 'me' }
const base = { displayName: 'Alex', greeting: 'Good afternoon', activeWork: [], listings: [], summaryCards: [], quickActions: [] }
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  window.matchMedia = vi.fn(() => ({ matches: true }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)

it('omits the greeting from the home header', () => {
  render(<AgentDashboard snapshot={{ ...base, displayName: '' }} onOpen={vi.fn()} />)
  expect(screen.queryByText('Good afternoon', { exact: true })).toBeNull()
  expect(screen.queryByText(/Good afternoon,/)).toBeNull()
})

it('shows two agent header counters before commission and opens only today’s appointments or assigned new leads', () => {
  const today = buildMobileToday({ now, profile, appointments: [
    { id: 'one', dateTime: '2026-10-06T10:30:00Z', typeLabel: 'Viewing today', statusKey: 'confirmed' },
    { id: 'later', dateTime: '2026-10-07T10:30:00Z', typeLabel: 'Tomorrow viewing', statusKey: 'confirmed' },
  ] })
  const onOpen = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, category: 'agent', today, newLeads: [{ leadId: 'one' }, { leadId: 'two' }], newLeadsAvailable: true }} onOpen={onOpen} />)
  const summary = screen.getByLabelText('Today summary')
  expect(within(summary).getAllByRole('button')).toHaveLength(2)
  expect(summary.compareDocumentPosition(screen.getByRole('region', { name: 'Your commission' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(summary).queryByText('Follow-ups due')).toBeNull()
  expect(within(summary).queryByText('Deals to move')).toBeNull()
  fireEvent.click(within(summary).getByRole('button', { name: '2 New leads' }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/leads?stage=new&scope=assigned')
  fireEvent.click(within(summary).getByRole('button', { name: '1 Appointments today' }))
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('places personal commission before today-only appointments and opens their saved details', () => {
  const today = buildMobileToday({ now, profile, appointments: [
    { id: 'today', dateTime: '2026-10-06T10:30:00Z', typeLabel: 'Property Viewing', statusKey: 'confirmed', clientName: 'Sarah', propertyAddress: '18 Oak Avenue' },
    { id: 'tomorrow', dateTime: '2026-10-07T10:30:00Z', typeLabel: 'Tomorrow Viewing', statusKey: 'confirmed' },
  ] })
  render(<AgentDashboard snapshot={{ ...base, category: 'agent', today, commission: { signedThisMonth: 25000, pipeline: 75000 } }} onOpen={vi.fn()} />)
  const commission = screen.getByRole('region', { name: 'Your commission' })
  const appointments = screen.getByRole('region', { name: 'Appointments today' })
  expect(commission.compareDocumentPosition(appointments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(appointments).getByText('12:30')).toBeTruthy()
  expect(within(appointments).queryByText(/Tomorrow/)).toBeNull()
  fireEvent.click(within(appointments).getByRole('button', { name: /Sarah/ }))
  expect(within(screen.getByRole('dialog')).getByText('18 Oak Avenue', { exact: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
  fireEvent.click(screen.getByRole('button', { name: 'Show total pipeline commission' }))
  expect(screen.getByRole('button', { name: 'Show total pipeline commission' }).getAttribute('aria-pressed')).toBe('true')
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled()
})

it('distinguishes empty and unavailable appointments below the commission card', () => {
  const onRefresh = vi.fn()
  const { rerender } = render(<AgentDashboard snapshot={{ ...base, category: 'agent', today: buildMobileToday({ now }) }} onOpen={vi.fn()} onRefresh={onRefresh} />)
  const appointments = screen.getByRole('region', { name: 'Appointments today' })
  expect(within(appointments).getByText('No appointments scheduled for today.')).toBeTruthy()
  rerender(<AgentDashboard snapshot={{ ...base, category: 'agent', today: buildMobileToday({ now, availability: { appointments: false } }) }} onOpen={vi.fn()} onRefresh={onRefresh} />)
  expect(within(appointments).queryByText('No appointments scheduled for today.')).toBeNull()
  fireEvent.click(within(appointments).getByRole('button', { name: 'Retry appointments' }))
  expect(onRefresh).toHaveBeenCalledOnce()
})

it('opens the actual next follow-up and its saved details without navigating to placeholder tasks', () => {
  const today = buildMobileToday({ now, profile, tasks: [{ taskId: 'call', title: 'Call Sarah about the viewing', dueDate: '2026-10-05', assignedAgentId: 'me', description: 'Confirm the viewing time with Sarah.' }] })
  const onOpen = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, today }} onOpen={onOpen} onAction={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Call Sarah about the viewing.*View follow-up/ }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Confirm the viewing time with Sarah.')).toBeTruthy()
  expect(within(dialog).getByText('Overdue')).toBeTruthy()
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close details' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('opens appointments from the summary, drills into a saved appointment, and opens its related deal', () => {
  const today = buildMobileToday({ now, profile, appointments: [{ id: 'viewing', dateTime: '2026-10-06T10:30:00Z', typeLabel: 'Property Viewing', status: 'confirmed', statusKey: 'confirmed', clientName: 'Sarah', propertyAddress: '18 Oak Avenue', transactionId: 'tx-one' }] })
  const onOpen = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, today }} onOpen={onOpen} onAction={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '1 Appointments today' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Prepare for property viewing/ }))
  expect(within(screen.getByRole('dialog')).getByText('18 Oak Avenue', { exact: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Open related deal' }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/transaction/tx-one')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('uses a recorded deal action and its exact route', () => {
  const today = buildMobileToday({ now, deals: [{ id: 'one', title: '18 Oak Avenue', nextAction: 'Review the signed OTP', to: '/mobile/transaction/one' }] })
  const onOpen = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, today }} onOpen={onOpen} onAction={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Review the signed OTP.*Open deal/ }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/transaction/one')
})

it('offers a retry for unavailable work instead of displaying a false clear day', () => {
  const today = buildMobileToday({ now, availability: { appointments: false, followUps: false, deals: false } })
  const onRefresh = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, today }} onOpen={vi.fn()} onAction={vi.fn()} onRefresh={onRefresh} />)
  expect(screen.queryByText('No actions due today.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '— Follow-ups due' }))
  expect(within(screen.getByRole('dialog')).getByText('We couldn’t load follow-ups.')).toBeTruthy()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Try again' }))
  expect(onRefresh).toHaveBeenCalledOnce()
})

it('opens a developer’s own portfolio from the shared dashboard and keeps agent listings separate', () => {
  const onOpen = vi.fn()
  const { rerender } = render(<AgentDashboard snapshot={{ ...base, category: 'developer', developments: [{ id: 'one', title: 'Junoah', activeDeals: 5, availableUnits: 2, totalUnits: 31, to: '/mobile/development/one' }] }} onOpen={onOpen} />)
  expect(screen.queryByRole('button', { name: /^Listings/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^Developments/ }))
  fireEvent.click(screen.getByRole('button', { name: /Junoah.*5 live deals/ }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/development/one')
  fireEvent.click(screen.getByRole('button', { name: 'Open developments' }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/developments')
  rerender(<AgentDashboard snapshot={{ ...base, category: 'agent' }} onOpen={onOpen} />)
  expect(screen.getByRole('region', { name: 'Tasks and new leads' })).toBeTruthy()
  expect(screen.queryByRole('navigation', { name: 'Dashboard pages' })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Developments/ })).toBeNull()
})

it('opens each current development from the home scroller, includes later cards, and excludes archived work', () => {
  const onOpen = vi.fn()
  const developments = Array.from({ length: 6 }, (_, index) => ({ id: `dev-${index}`, title: `Estate ${index + 1}`, status: index === 0 ? 'draft' : 'active', totalUnits: 30, availableUnits: 8, activeDeals: 4, to: `/mobile/development/dev-${index}` }))
  developments.push({ id: 'archived', title: 'Archived estate', status: 'archived', to: '/mobile/development/archived' })
  const { rerender } = render(<AgentDashboard snapshot={{ ...base, category: 'developer', developments }} onOpen={onOpen} />)
  const scroller = screen.getByRole('region', { name: 'Swipe through current developments' })
  expect(screen.getByRole('region', { name: 'New leads' }).compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(scroller).getAllByRole('link')).toHaveLength(6)
  expect(within(scroller).queryByText('Archived estate')).toBeNull()
  const lastCard = within(scroller).getByRole('link', { name: /Estate 6/ })
  expect(lastCard.getAttribute('href')).toBe('/mobile/development/dev-5')
  fireEvent.click(lastCard)
  expect(onOpen).toHaveBeenCalledWith('/mobile/development/dev-5')
  fireEvent.click(within(screen.getByRole('region', { name: 'Current developments' })).getByRole('link', { name: 'View all' }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/developments')
  rerender(<AgentDashboard snapshot={{ ...base, category: 'agent', developments }} onOpen={onOpen} />)
  expect(screen.queryByRole('region', { name: 'Swipe through current developments' })).toBeNull()
})

it('gives developers two top counters, then all transaction and lead cards before their developments', () => {
  const onOpen = vi.fn()
  const transactions = Array.from({ length: 7 }, (_, index) => ({ id: `tx-${index}`, title: `Unit ${index + 1}`, eyebrow: `Buyer ${index + 1}`, stage: 'XFER', to: `/mobile/transaction/tx-${index}` }))
  const newLeads = Array.from({ length: 6 }, (_, index) => ({ developerLeadId: `lead-${index}`, buyerFullName: `New Buyer ${index + 1}`, leadStatus: 'new', leadSource: 'property24', unitTypeInterest: 'Two bedrooms' }))
  const { rerender } = render(<AgentDashboard snapshot={{ ...base, category: 'developer', transactions, activeWork: transactions.slice(0, 5), newLeads, summaryCards: [{ key: 'active', value: 7 }], developments: [{ id: 'dev', title: 'Estate', status: 'active', to: '/mobile/development/dev' }] }} onOpen={onOpen} />)
  const counts = screen.getByLabelText('Developer summary')
  expect(within(counts).getAllByRole('button')).toHaveLength(2)
  fireEvent.click(within(counts).getByRole('button', { name: '6 New Leads' }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/developer/leads')
  fireEvent.click(within(counts).getByRole('button', { name: '7 Active Deals' }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/transactions')
  expect(screen.queryByText(/Good afternoon, Alex/)).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
  expect(screen.queryByText('Pipeline value')).toBeNull()
  expect(screen.queryByText('Active deals', { exact: true })).toBeNull()
  const deals = screen.getByRole('region', { name: 'Swipe through active transactions' })
  const leads = screen.getByRole('region', { name: 'Swipe through new leads' })
  expect(within(deals).getAllByRole('link')).toHaveLength(7)
  expect(within(leads).getAllByRole('link')).toHaveLength(6)
  expect(deals.compareDocumentPosition(leads) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(leads.compareDocumentPosition(screen.getByRole('region', { name: 'Current developments' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(deals).getByRole('link', { name: /Unit 7/ }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/transaction/tx-6')
  fireEvent.click(within(leads).getByRole('link', { name: /New Buyer 6/ }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/developer/leads/lead-5')
  rerender(<AgentDashboard snapshot={{ ...base, category: 'agent', transactions, newLeads }} onOpen={onOpen} />)
  expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
  expect(screen.getByLabelText('Today summary')).toBeTruthy()
  expect(screen.queryByText('Pipeline value')).toBeNull()
  expect(screen.queryByText('Active deals', { exact: true })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Swipe through new leads' })).toBeNull()
})

it('keeps agency-held buyer details protected in dashboard lead cards', () => {
  render(<AgentDashboard snapshot={{ ...base, category: 'developer', newLeads: [{ developerLeadId: 'agency/one', leadOwner: 'agency', visibilityState: 'limited', buyerFullName: 'Private buyer', buyerEmail: 'private@example.test', nextActionNote: 'Call Private buyer', publicReference: 'REF-101', protectedSummary: 'Two bedroom apartment' }] }} onOpen={vi.fn()} />)
  const scroller = screen.getByRole('region', { name: 'Swipe through new leads' })
  expect(within(scroller).queryByText(/Private buyer/)).toBeNull()
  expect(within(scroller).queryByText('private@example.test')).toBeNull()
  expect(within(scroller).getByText('Contact details protected until agency handover.')).toBeTruthy()
  expect(within(scroller).getByRole('link').getAttribute('href')).toBe('/mobile/developer/leads/agency%2Fone')
})

it('shows portal logos in new leads, removes source-only enquiry captions and retains actual property preferences', () => {
  const leads = [
    { developerLeadId: 'p24', buyerFullName: 'Buyer One', leadSource: 'Property24 development enquiry', unitTypeInterest: 'Property24 Development Enquiry' },
    { developerLeadId: 'pp', buyerFullName: 'Buyer Two', leadSource: 'Private Property Inquiry', unitTypeInterest: 'Private Property Inquiry' },
    { developerLeadId: 'specific', buyerFullName: 'Buyer Three', leadSource: 'property24', unitTypeInterest: 'Two bedrooms' },
    { developerLeadId: 'direct', buyerFullName: 'Buyer Four', leadSource: 'developer_direct', unitTypeInterest: 'Townhouse' },
  ]
  render(<AgentDashboard snapshot={{ ...base, category: 'developer', newLeads: leads }} onOpen={vi.fn()} />)
  const scroller = within(screen.getByRole('region', { name: 'Swipe through new leads' }))
  expect(scroller.getAllByRole('img', { name: 'Property24' })).toHaveLength(2)
  expect(scroller.getByRole('img', { name: 'Private Property' }).getAttribute('src')).toBe('/lead-sources/private-property.jpeg')
  expect(scroller.queryByText('Property24 Development Enquiry')).toBeNull()
  expect(scroller.queryByText('Private Property Inquiry')).toBeNull()
  expect(scroller.getByText('Two bedrooms')).toBeTruthy()
  expect(scroller.getByText('Developer direct')).toBeTruthy()

  fireEvent.error(scroller.getByRole('img', { name: 'Private Property' }))
  expect(scroller.queryByRole('img', { name: 'Private Property' })).toBeNull()
  expect(scroller.getByText('Private Property', { exact: true })).toBeTruthy()
})

it('distinguishes empty leads from an unavailable lead read and offers a retry', () => {
  const onRefresh = vi.fn()
  const { rerender } = render(<AgentDashboard snapshot={{ ...base, category: 'developer', newLeads: [] }} onOpen={vi.fn()} onRefresh={onRefresh} />)
  expect(screen.getByRole('button', { name: '0 New Leads' })).toBeTruthy()
  expect(screen.getByText('No new leads yet.')).toBeTruthy()
  expect(screen.getByText('No active transactions yet.')).toBeTruthy()
  rerender(<AgentDashboard snapshot={{ ...base, category: 'developer', newLeads: [], newLeadsAvailable: false }} onOpen={vi.fn()} onRefresh={onRefresh} />)
  expect(screen.getByRole('button', { name: '— New Leads' })).toBeTruthy()
  expect(screen.queryByText('No new leads yet.')).toBeNull()
  fireEvent.click(within(screen.getByRole('region', { name: 'New leads' })).getByRole('button', { name: 'Try again' }))
  expect(onRefresh).toHaveBeenCalledOnce()
})

it('keeps the selected tab in sync when swiping between dashboard panels', () => {
  render(<AgentDashboard snapshot={{ ...base, category: 'developer' }} onOpen={vi.fn()} />)
  const book = screen.getByLabelText('Swipe through your dashboard')
  Array.from(book.children).forEach((panel, index) => Object.defineProperty(panel, 'offsetLeft', { value: 20 + index * 320 }))
  book.scrollLeft = 320
  fireEvent.scroll(book)
  expect(screen.getByRole('button', { name: 'Deals' }).getAttribute('aria-current')).toBe('page')
  book.scrollLeft = 640
  fireEvent.scroll(book)
  expect(screen.getByRole('button', { name: 'Developments' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByLabelText('Page 3 of 3')).toBeTruthy()
})

it('places up to three appointments below the daily scroller and opens the calendar', () => {
  const today = buildMobileToday({ now, profile, appointments: [0, 1, 2, 3].map(index => ({ id: `visit-${index}`, dateTime: `2026-10-06T${11 + index}:00:00Z`, typeLabel: 'Viewing', statusKey: 'confirmed', clientName: `Client ${index}` })) })
  const onOpen = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, category: 'principal', today }} onOpen={onOpen} />)
  const appointments = screen.getByRole('region', { name: 'Appointments today' })
  expect(screen.getByRole('region', { name: 'Tasks and new leads' }).compareDocumentPosition(appointments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(appointments).getAllByRole('time')).toHaveLength(3)
  expect(within(appointments).queryByText(/Client 3/)).toBeNull()
  fireEvent.click(within(appointments).getByRole('button', { name: 'View calendar' }))
  expect(onOpen).toHaveBeenCalledWith('/mobile/calendar')
})


it('shows at most three recorded deal actions below appointments and opens the saved transaction', () => {
  const deals = [0, 1, 2, 3].map(index => ({ id: `deal-${index}`, title: `${index} Oak Avenue`, nextAction: `Review signed offer ${index}`, stage: 'Offer', to: `/mobile/transaction/deal-${index}` }))
  const today = buildMobileToday({ now, profile, deals })
  const onOpen = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, category: 'principal', today }} onOpen={onOpen} />)
  const attention = screen.getByRole('region', { name: 'Deals needing attention' })
  expect(screen.getByRole('region', { name: 'Appointments today' }).compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(attention).queryByText('3 Oak Avenue')).toBeNull()
  fireEvent.click(within(attention).getByRole('button', { name: /0 Oak Avenue/ }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/transaction/deal-0')
  fireEvent.click(within(attention).getByRole('button', { name: 'View deals' }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/transactions')
})

it('hides deal attention when there are no recorded actions or the same action is already a task', () => {
  const today = buildMobileToday({ now, profile, deals: [{ id: 'one', title: '18 Oak Avenue', nextAction: 'Review offer', to: '/mobile/transaction/one' }] })
  today.taskChecklist = [{ id: 'task', title: 'Review offer', body: '18 Oak Avenue', completed: false }]
  const view = render(<AgentDashboard snapshot={{ ...base, category: 'agent', today }} onOpen={vi.fn()} />)
  expect(screen.queryByRole('region', { name: 'Deals needing attention' })).toBeNull()
  view.rerender(<AgentDashboard snapshot={{ ...base, category: 'principal', today: buildMobileToday({ now, deals: [{ id: 'no-action', title: 'No action' }] }) }} onOpen={vi.fn()} />)
  expect(screen.queryByRole('region', { name: 'Deals needing attention' })).toBeNull()
})

it('shows a retry when deal actions are unavailable', () => {
  const onRefresh = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, category: 'principal', today: buildMobileToday({ now, availability: { deals: false } }) }} onOpen={vi.fn()} onRefresh={onRefresh} />)
  fireEvent.click(within(screen.getByRole('region', { name: 'Deals needing attention' })).getByRole('button', { name: 'Retry deals' }))
  expect(onRefresh).toHaveBeenCalledOnce()
})

it('opens appointment creation from the matching plus in the appointments container', () => {
  const onCreateAppointment = vi.fn()
  render(<AgentDashboard snapshot={{ ...base, category: 'agent', today: buildMobileToday({ now }) }} onOpen={vi.fn()} onCreateAppointment={onCreateAppointment} />)
  const section = screen.getByRole('region', { name: 'Appointments today' })
  fireEvent.click(within(section).getByRole('button', { name: 'Add appointment' }))
  expect(onCreateAppointment).toHaveBeenCalledOnce()
  expect(within(section).getByRole('button', { name: 'View calendar' })).toBeTruthy()
})
