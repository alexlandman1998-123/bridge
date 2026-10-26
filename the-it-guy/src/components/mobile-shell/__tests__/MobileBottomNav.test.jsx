// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileBottomNav from '../MobileBottomNav.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, appointment: null, leadCreate: null }))
vi.mock('../mobileAppointmentCreateContext.js', () => ({ useMobileAppointmentCreate: () => mocks.appointment }))
vi.mock('../mobileLeadCreateContext.js', () => ({ useMobileLeadCreate: () => mocks.leadCreate }))
vi.mock('../MobileContactCreateSheet.jsx', () => ({ default: ({ onClose }) => <div role="dialog" aria-label="New contact"><button onClick={onClose}>Close contact form</button></div> }))
vi.mock('../MobileConnectSheet.jsx', () => ({ default: ({ onClose }) => <div role="dialog" aria-label="Connect with me"><button onClick={onClose}>Close contact sheet</button></div> }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
beforeEach(() => {
  mocks.workspace = { role: 'developer' }
  mocks.appointment = null
  mocks.leadCreate = null
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function RouteState() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output aria-label="Current page">{location.pathname}</output><output aria-label="Current query">{location.search}</output><button onClick={() => navigate('/mobile/transactions')}>Navigate externally</button></>
}
function setup(path = '/mobile/home') {
  return render(<MemoryRouter initialEntries={[path]}><MobileBottomNav /><RouteState /></MemoryRouter>)
}

it('puts developer Leads in the bottom navigation and Developments in the arrow menu', () => {
  setup('/mobile/developer/leads/lead-1')
  const navigation = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
  const leads = navigation.getByRole('link', { name: 'Leads', exact: true })
  expect(leads.getAttribute('href')).toBe('/mobile/developer/leads')
  expect(leads.getAttribute('aria-current')).toBe('page')
  expect(navigation.queryByRole('link', { name: 'Developments', exact: true })).toBeNull()
  expect(screen.queryByRole('link', { name: 'More', exact: true })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Menu' }))
  expect(menu.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Developments', '/mobile/developments'], ['Listings', '/mobile/listings'], ['Calendar', '/mobile/calendar'],
  ])
  fireEvent.click(menu.getByRole('link', { name: 'Developments' }))
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/developments')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Open page menu' }).getAttribute('aria-expanded')).toBe('false')
})

it('keeps Leads in primary navigation and removes the duplicate menu entry and Pages heading', () => {
  mocks.workspace = { role: 'agent' }
  setup('/mobile/leads')
  expect(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('link', { name: 'Leads' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Menu' }))
  expect(menu.queryByRole('link', { name: 'Leads' })).toBeNull()
  expect(menu.queryByText('Pages')).toBeNull()
  expect(menu.getAllByRole('link').map(link => link.textContent)).toEqual(['Listings', 'Calendar', 'Marketing', 'Campaigns', 'Template shop'])
})

it('opens the template shop in the mobile workspace and highlights its query destination', () => {
  mocks.workspace = { role: 'agent', workspaceRole: 'principal' }
  setup('/mobile/marketing?section=campaigns&page=studio&collection=channels&channel=email')
  expect(screen.getByRole('button', { name: 'Open page menu' }).className).toContain('bg-[#e5f6ed]')
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Menu' }))
  expect(menu.getByRole('link', { name: 'Template shop' }).getAttribute('aria-current')).toBe('page')
  expect(menu.getByRole('link', { name: 'Campaigns' }).getAttribute('aria-current')).toBeNull()
  expect(menu.getByRole('link', { name: 'Marketing', exact: true }).getAttribute('aria-current')).toBeNull()
  fireEvent.click(menu.getByRole('link', { name: 'Template shop' }))
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/marketing')
  expect(screen.getByLabelText('Current query').textContent).toBe('?section=campaigns&page=studio')
})

it('keeps the marketing menu active in a channel workspace', () => {
  mocks.workspace = { role: 'agent' }
  setup('/mobile/marketing?section=email&view=create&id=email-1')
  expect(screen.getByRole('button', { name: 'Open page menu' }).className).toContain('bg-[#e5f6ed]')
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  expect(screen.getByRole('link', { name: 'Marketing', exact: true }).getAttribute('aria-current')).toBe('page')
})

it.each([
  '?section=campaigns&view=templates',
  '?section=campaigns&view=template-edit&id=template-1',
  '?section=campaigns&view=channel-template-edit&id=channel-template-1',
  '?section=campaigns&view=create&channelTemplate=channel-template-1',
])('keeps the template shop selected for its existing editor links: %s', (query) => {
  mocks.workspace = { role: 'agent' }
  setup(`/mobile/marketing${query}`)
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Menu' }))
  expect(menu.getByRole('link', { name: 'Template shop' }).getAttribute('aria-current')).toBe('page')
  expect(menu.getByRole('link', { name: 'Campaigns' }).getAttribute('aria-current')).toBeNull()
})

it.each([
  { role: 'agent', businessWorkspaceId: 'rentals' },
  { role: 'agent', businessWorkspaceId: 'short_term_rentals' },
  { role: 'attorney' },
  { role: 'bond_originator' },
  { role: 'commercial' },
])('keeps marketing out of other mobile workspaces: %j', (workspace) => {
  mocks.workspace = workspace
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Menu' }))
  expect(menu.queryByRole('link', { name: 'Marketing', exact: true })).toBeNull()
  expect(menu.queryByRole('link', { name: 'Template shop' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Close page menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  expect(screen.queryByRole('button', { name: 'New campaign' })).toBeNull()
})

it('starts a new campaign from the agent add menu in the mobile workspace', () => {
  mocks.workspace = { role: 'agent' }
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'New campaign' }))
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/marketing')
  expect(screen.getByLabelText('Current query').textContent).toBe('?section=campaigns&view=create')
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
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

it('dismisses the add menu on native cancel and on navigation', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent(screen.getByRole('dialog', { name: 'Add new' }), new Event('cancel', { bubbles: true }))
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Navigate externally' }))
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
})

it('offers Connect with me in the agency menu and closes the menu before opening the sheet', async () => {
  mocks.workspace = { role: 'agent' }
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open page menu' }))
  fireEvent.click(screen.getByRole('button', { name: /Connect with me/ }))
  expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  expect(await screen.findByRole('dialog', { name: 'Connect with me' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close contact sheet' }))
  expect(screen.queryByRole('dialog', { name: 'Connect with me' })).toBeNull()
})

it('shows the four creation actions without old headings or retired shortcuts', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  const menu = within(screen.getByRole('dialog', { name: 'Add new' }))
  expect(menu.queryByText('Create')).toBeNull()
  expect(menu.queryByText('Quick action')).toBeNull()
  for (const label of ['Scan Document', 'New Transaction', 'Add Note', 'Schedule Follow-up', 'Add Prospect']) {
    expect(menu.queryByRole('button', { name: new RegExp(label, 'i') })).toBeNull()
  }
  expect(menu.getAllByRole('button').map(button => button.textContent)).toEqual(['', 'New lead', 'New listing', 'New appointment', 'New contact'])
  fireEvent.click(menu.getByRole('button', { name: /New lead/ }))
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/developer/leads')
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
})

it('opens the mobile listing editor from New listing', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'New listing' }))
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/listings/new')
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
})

it('opens shared lead and appointment capture over the current page', () => {
  mocks.workspace = { role: 'agent' }
  mocks.leadCreate = { openLeadCreate: vi.fn() }
  mocks.appointment = { openAppointmentCreate: vi.fn() }
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'New lead' }))
  expect(mocks.leadCreate.openLeadCreate).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'New appointment' }))
  expect(mocks.appointment.openAppointmentCreate).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/home')
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
})

it('opens and closes contact capture over Home', async () => {
  mocks.workspace = { role: 'agent' }
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'New contact' }))
  expect(await screen.findByRole('dialog', { name: 'New contact' })).toBeTruthy()
  expect(screen.getByLabelText('Current page').textContent).toBe('/mobile/home')
  expect(screen.queryByRole('dialog', { name: 'Add new' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Close contact form' }))
  expect(screen.queryByRole('dialog', { name: 'New contact' })).toBeNull()
})
