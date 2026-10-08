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
  window.matchMedia = vi.fn(() => ({ matches: true }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)

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
  expect(screen.getByRole('button', { name: /^Listings/ })).toBeTruthy()
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
  expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
  expect(screen.getByLabelText('Today summary')).toBeTruthy()
  expect(screen.getByText('Pipeline value')).toBeTruthy()
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
