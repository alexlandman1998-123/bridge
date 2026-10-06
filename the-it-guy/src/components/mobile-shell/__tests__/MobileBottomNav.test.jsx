// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileBottomNav from '../MobileBottomNav.jsx'

const mocks = vi.hoisted(() => ({ workspace: null }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
beforeEach(() => {
  mocks.workspace = { role: 'developer' }
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function RouteState() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output aria-label="Current page">{location.pathname}</output><button onClick={() => navigate('/mobile/transactions')}>Navigate externally</button></>
}
function setup(path = '/mobile/home') {
  return render(<MemoryRouter initialEntries={[path]}><MobileBottomNav /><RouteState /></MemoryRouter>)
}

it('opens the arrow menu with developer Leads, Listings and Calendar and closes after navigation', () => {
  setup()
  expect(screen.queryByRole('link', { name: 'More', exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Pages' }))
  expect(menu.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Leads', '/mobile/developer/leads'], ['Listings', '/mobile/listings'], ['Calendar', '/mobile/calendar'],
  ])
  fireEvent.click(menu.getByRole('link', { name: 'Calendar' }))
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/calendar')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Open page menu' }).getAttribute('aria-expanded')).toBe('false')
})

it('keeps agency Leads in its existing scope and primary navigation', () => {
  mocks.workspace = { role: 'agent' }
  setup('/mobile/leads')
  expect(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('link', { name: 'Leads' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Leads' }).getAttribute('href')).toBe('/mobile/leads')
})

it('dismisses on native cancel, the close button, and a location change', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close page menu' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Navigate externally' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
