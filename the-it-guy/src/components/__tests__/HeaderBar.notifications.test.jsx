// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import HeaderBar from '../HeaderBar.jsx'

const mocks = vi.hoisted(() => ({ read: vi.fn(), mark: vi.fn(), markAll: vi.fn() }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ role: 'developer', profile: { id: 'me' } }) }))
vi.mock('../../lib/headerNotificationsApi', () => ({ fetchMyNotifications: mocks.read, markNotificationRead: mocks.mark, markAllNotificationsRead: mocks.markAll }))
vi.mock('../LazyQuickCreateDropdown', () => ({ default: () => null }))
const rows = [
  { id: 'unread', title: 'New buyer enquiry', message: 'Sarah asked about Unit 002.', isRead: false, createdAt: '2026-10-21T08:00:00Z', eventData: {} },
  { id: 'read', title: 'Earlier enquiry', message: 'An earlier update.', isRead: true, createdAt: '2026-10-20T08:00:00Z', eventData: {} },
]
beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockResolvedValue({ notifications: rows, unreadCount: 1 })
})
afterEach(cleanup)
function mount() { render(<MemoryRouter initialEntries={['/dashboard']}><HeaderBar user={{ id: 'me' }} /></MemoryRouter>) }

it('filters unread updates locally and restores focus when dismissed', async () => {
  mount()
  const bell = screen.getByRole('button', { name: /^Notifications/ })
  fireEvent.click(bell)
  const dialog = await screen.findByRole('dialog', { name: 'Notifications' })
  await within(dialog).findByText('Sarah asked about Unit 002.')
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close notifications' }))
  fireEvent.click(within(dialog).getByRole('button', { name: /^Unread/ }))
  expect(within(dialog).queryByText('An earlier update.')).toBeNull()
  expect(within(dialog).getByText('Sarah asked about Unit 002.')).toBeTruthy()
  expect(mocks.mark).not.toHaveBeenCalled()
  expect(mocks.markAll).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(bell)
})

it('shows the loading status and a caught-up unread view', async () => {
  let resolve
  mocks.read.mockImplementation(() => new Promise((done) => { resolve = done }))
  mount()
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
  expect(screen.getByRole('status', { name: 'Loading notifications' })).toBeTruthy()
  resolve({ notifications: [], unreadCount: 0 })
  expect(await screen.findByText('You’re all caught up')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Unread/ }))
  expect(screen.getByText('You’re all caught up')).toBeTruthy()
})

it('puts the lead name first and shows the recorded platform logo with a safe image fallback', async () => {
  mocks.read.mockResolvedValue({ notifications: [{ ...rows[0], eventData: { leadName: 'Sarah Jacobs', leadSource: 'Property24', propertyAddress: '12 Oak Street' } }], unreadCount: 1 })
  mount()
  fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }))
  expect(await screen.findByText('Sarah Jacobs')).toBeTruthy()
  expect(screen.getByText('Property24')).toBeTruthy()
  const logo = document.querySelector('.notification-lead-source img')
  expect(logo.getAttribute('src')).toBe('/lead-sources/property24.png')
  fireEvent.error(logo)
  expect(document.querySelector('.notification-lead-source img')).toBeNull()
  expect(screen.getByText('Property24')).toBeTruthy()
})
