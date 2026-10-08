// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileHeader from '../MobileHeader.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, read: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../lib/headerNotificationsApi.js', () => ({ fetchMyNotifications: mocks.read }))
const notification = { id: 'one', title: 'New buyer lead', message: 'Sarah enquired about Unit 002.', createdAt: '2026-10-06T08:00:00Z', eventData: { leadId: 'saved-lead' } }
function Page() { const location = useLocation(); return <><MobileHeader /><main><h1>Current page</h1><output aria-label="Current route">{location.pathname}</output><button type="button">Page action</button></main></> }
const page = () => <MemoryRouter initialEntries={['/mobile/transactions']}><Page /></MemoryRouter>
beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace = { role: 'developer', profile: { id: 'me' }, currentWorkspace: { id: 'org-one' } }
  mocks.organisation = { organisation: { id: 'org-one' }, branding: { organisationLabel: 'Samlin' } }
  mocks.read.mockResolvedValue({ notifications: [notification], unreadCount: 1 })
})
afterEach(cleanup)

it('opens push notification settings from the bell and closes the dropdown', async () => {
  render(page())
  fireEvent.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await act(async () => {})
  fireEvent.click(screen.getByRole('link', { name: 'Push notification settings' }))
  expect(screen.getByLabelText('Current route').textContent).toBe('/mobile/inbox')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('opens in place, shows actual unread alerts, and dismisses with Escape and outside tap', async () => {
  render(page())
  await act(async () => {})
  expect(screen.getByLabelText('1 unread notifications')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull()
  const bell = screen.getByRole('button', { name: 'Notifications', exact: true })
  fireEvent.click(bell)
  await act(async () => {})
  expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeTruthy()
  expect(screen.getByText('New buyer lead')).toBeTruthy()
  expect(screen.getByLabelText('Current route').textContent).toBe('/mobile/transactions')
  expect(mocks.read).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close notifications' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(bell)
  fireEvent.click(bell)
  await act(async () => {})
  fireEvent.pointerDown(screen.getByRole('heading', { name: 'Current page' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('opens the saved lead only after selecting its notification and closes the dropdown', async () => {
  render(page())
  fireEvent.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await act(async () => {})
  fireEvent.click(screen.getByRole('link', { name: /New buyer lead/ }))
  expect(screen.getByLabelText('Current route').textContent).toBe('/mobile/developer/leads/saved-lead')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.read).toHaveBeenCalledWith({ userId: 'me', unreadOnly: true, limit: 100 })
})

it('distinguishes unavailable notifications from an empty feed and retries', async () => {
  mocks.read.mockRejectedValue(new Error('Unavailable'))
  render(page())
  fireEvent.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toContain('couldn’t load notifications')
  expect(screen.queryByText('You’re all caught up')).toBeNull()
  mocks.read.mockResolvedValueOnce({ notifications: [], unreadCount: 0 })
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await act(async () => {})
  expect(screen.getByText('You’re all caught up')).toBeTruthy()
  expect(screen.queryByLabelText('1 unread notifications')).toBeNull()
})

it('closes and hides old alerts when the user changes, ignoring their late response', async () => {
  let resolveOld
  mocks.read.mockImplementation(() => new Promise((resolve) => { resolveOld = resolve }))
  const { rerender } = render(page())
  fireEvent.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await act(async () => {})
  mocks.workspace = { ...mocks.workspace, profile: { id: 'new-user' } }
  mocks.read.mockResolvedValue({ notifications: [], unreadCount: 0 })
  rerender(page())
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => resolveOld({ notifications: [notification], unreadCount: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Notifications', exact: true }))
  await act(async () => {})
  expect(screen.queryByText('New buyer lead')).toBeNull()
  expect(screen.getByText('You’re all caught up')).toBeTruthy()
  expect(mocks.read).toHaveBeenLastCalledWith({ userId: 'new-user', unreadOnly: true, limit: 100 })
})
