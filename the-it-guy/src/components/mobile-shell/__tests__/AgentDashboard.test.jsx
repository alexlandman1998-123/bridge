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
  expect(screen.getByLabelText('Developer summary').compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(scroller).getAllByRole('link')).toHaveLength(6)
  expect(within(scroller).queryByText('Archived estate')).toBeNull()
  const lastCard = within(scroller).getByRole('link', { name: /Estate 6/ })
  expect(lastCard.getAttribute('href')).toBe('/mobile/development/dev-5')
  fireEvent.click(lastCard)
  expect(onOpen).toHaveBeenCalledWith('/mobile/development/dev-5')
  fireEvent.click(screen.getByRole('link', { name: 'View all' }))
  expect(onOpen).toHaveBeenLastCalledWith('/mobile/developments')
  rerender(<AgentDashboard snapshot={{ ...base, category: 'agent', developments }} onOpen={onOpen} />)
  expect(screen.queryByRole('region', { name: 'Swipe through current developments' })).toBeNull()
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
