// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileHomeSummaryCards from '../MobileHomeSummaryCards.jsx'
import { buildMobileToday } from '../../../services/mobileTodayModel.js'

const now = new Date('2026-10-22T08:00:00Z')
const snapshot = { category: 'agent', newLeads: [], commission: { signedThisMonth: 25000 } }
beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn()
  window.matchMedia = vi.fn(() => ({ matches: true }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows the buyer and seller breakdown inside Home’s New Leads card', () => {
  render(<MobileHomeSummaryCards snapshot={{ ...snapshot, newLeads: [
    { leadCategory: 'buyer' }, { leadCategory: 'buyer' }, { leadCategory: 'seller' }, { leadCategory: 'other' },
  ] }} today={buildMobileToday({ now })} onOpen={vi.fn()} onTasks={vi.fn()} onCommission={vi.fn()} />)
  const card = screen.getByRole('button', { name: /^New Leads: Buyer: 2\. Seller: 1\./ })
  expect(card.contains(screen.getByRole('group', { name: 'New lead breakdown' }))).toBe(true)
})

it('counts all open tasks, distinguishes overdue work and opens the real outstanding list', () => {
  const today = buildMobileToday({ now, includeAllFollowUps: true, tasks: [
    { taskId: 'late', title: 'Call buyer', dueDate: '2026-10-21', status: 'Pending' },
    { taskId: 'future', title: 'Prepare pack', dueDate: '2026-10-25', status: 'Pending' },
    { taskId: 'done', title: 'Completed task', dueDate: '2026-10-22', status: 'Completed' },
  ] })
  const onTasks = vi.fn()
  render(<MobileHomeSummaryCards snapshot={snapshot} today={today} onTasks={onTasks} onCommission={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /^Tasks Outstanding: 2\. 1 overdue/ }))
  expect(onTasks).toHaveBeenCalledOnce()
})

it('uses today’s next appointment time in South Africa and labels commission as signed', () => {
  const today = buildMobileToday({ now, appointments: [
    { id: 'past', dateTime: '2026-10-22T07:00:00Z', typeLabel: 'Call', statusKey: 'confirmed' },
    { id: 'next', dateTime: '2026-10-22T10:30:00Z', typeLabel: 'Viewing', statusKey: 'confirmed' },
    { id: 'later', dateTime: '2026-10-23T10:30:00Z', typeLabel: 'Viewing', statusKey: 'confirmed' },
  ] })
  render(<MobileHomeSummaryCards snapshot={snapshot} today={today} onOpen={vi.fn()} onTasks={vi.fn()} onCommission={vi.fn()} />)
  expect(screen.getByRole('button', { name: /^Appointments Today: 2\. Next at 12:30 · Viewing/ })).toBeTruthy()
  expect(screen.getByText('Your share · signed this month')).toBeTruthy()
  expect(screen.queryByText(/paid/i)).toBeNull()
})

it('shows unavailable figures as dashes and retries instead of claiming zero work', () => {
  const onRefresh = vi.fn()
  const today = buildMobileToday({ now, availability: { appointments: false, followUps: false } })
  render(<MobileHomeSummaryCards snapshot={{ category: 'agent', newLeadsAvailable: false }} today={today} onRefresh={onRefresh} />)
  for (const name of ['New Leads', 'Appointments Today', 'Tasks Outstanding', 'Commission This Month']) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}: ${name === 'New Leads' ? 'Buyer: ' : ''}—`) }))
  }
  expect(onRefresh).toHaveBeenCalledTimes(4)
})

it('updates the compact counter after native swiping without navigating', () => {
  const onOpen = vi.fn()
  const { container } = render(<MobileHomeSummaryCards snapshot={snapshot} today={buildMobileToday({ now })} onOpen={onOpen} onTasks={vi.fn()} onCommission={vi.fn()} />)
  const track = container.querySelector('.mobile-home-summary-track')
  Array.from(track.children).forEach((item, index) => Object.defineProperty(item, 'offsetLeft', { value: index * 320 }))
  expect(screen.getByLabelText('Card 1 of 4').getAttribute('aria-current')).toBe('true')
  track.scrollLeft = 960
  fireEvent.scroll(track)
  expect(screen.getByLabelText('Card 4 of 4').getAttribute('aria-current')).toBe('true')
  expect(onOpen).not.toHaveBeenCalled()
})
