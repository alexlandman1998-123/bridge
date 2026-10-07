// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AddDevelopmentModal from '../AddDevelopmentModal.jsx'
import { createDevelopmentWorkspace } from '../../lib/api.js'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import { invokeEdgeFunction } from '../../lib/supabaseClient.js'

vi.mock('../../lib/api.js', () => ({
  createDevelopmentWorkspace: vi.fn(),
  fetchDeveloperAccessOptions: vi.fn(async () => []),
  fetchDeveloperPartnersWorkspace: vi.fn(async () => ({ relationships: [], preferredPartners: [] })),
}))
vi.mock('../../lib/location/upsertArea', () => ({ upsertAreaFromAddress: vi.fn(async () => null) }))
vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, invokeEdgeFunction: vi.fn(async () => ({})) }))
vi.mock('../../lib/whatsapp', () => ({ formatSouthAfricanWhatsAppNumber: (number) => number, sendWhatsAppNotification: vi.fn(async () => ({})) }))
vi.mock('../../context/WorkspaceContext', () => {
  const context = { profile: { fullName: 'Test Agent', email: 'agent@example.test' }, workspace: { id: 'agency', name: 'Test Agency' } }
  return { useWorkspace: () => context }
})

beforeEach(() => {
  vi.clearAllMocks()
  createDevelopmentWorkspace.mockResolvedValue({ id: 'saved-development', warnings: [] })
  upsertAreaFromAddress.mockResolvedValue(null)
})
afterEach(cleanup)

function open() {
  const callbacks = { onClose: vi.fn(), onCreated: vi.fn() }
  render(<AddDevelopmentModal open contextRole="agent" {...callbacks} />)
  return callbacks
}
function details() {
  fireEvent.change(screen.getByLabelText('Development Name'), { target: { value: 'Willow Park' } })
  fireEvent.change(screen.getByLabelText('Location / Address'), { target: { value: '12 Test Road' } })
}
function next() { fireEvent.click(screen.getByRole('button', { name: 'Continue' })) }
function review() { details(); next(); next(); next() }

it('shows open details and defers developer access until Sales setup', () => {
  open()
  expect(screen.queryByText('Development Summary')).toBeNull()
  expect(screen.queryByText('Advanced Settings')).toBeNull()
  expect(screen.getByLabelText('City')).toBeTruthy()
  expect(screen.getByLabelText(/Launch Date/)).toBeTruthy()
  expect(screen.queryByLabelText(/Status/)).toBeNull()
  expect(screen.queryByLabelText('Developer / Organisation')).toBeNull()
  details(); next(); next()
  expect(screen.getByLabelText('Developer / Organisation')).toBeTruthy()
  expect(screen.getByText('Developer Access')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Choose another' })).toBeNull()
})

it('checks required details before a draft save and saves the type with manual address details', async () => {
  const callbacks = open()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('Development name is required')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
  details()
  fireEvent.click(screen.getByRole('radio', { name: 'Mixed-use' }))
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Johannesburg' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledTimes(1))
  const payload = createDevelopmentWorkspace.mock.calls[0][0]
  expect(payload.details).toMatchObject({ status: 'draft', address: '12 Test Road', city: 'Johannesburg', marketingContent: { listingOverview: { developmentType: 'mixed_use' } } })
  expect(payload.units).toEqual([])
  expect(payload.developmentSettings.stakeholderTeams.developers).toEqual([])
  expect(invokeEdgeFunction).not.toHaveBeenCalled()
})

it('rejects invalid dates and fractional planned units before any save', () => {
  open(); details()
  fireEvent.change(screen.getByLabelText(/Launch Date/), { target: { value: '2026-12-01' } })
  fireEvent.change(screen.getByLabelText(/Expected Completion/), { target: { value: '2026-11-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('on or after')
  fireEvent.change(screen.getByLabelText(/Expected Completion/), { target: { value: '2027-01-01' } })
  next()
  fireEvent.change(screen.getByLabelText('Planned Units'), { target: { value: '1.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('whole number')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
})

it('does not create on an early Enter submit and creates once after Review', async () => {
  const callbacks = open(); details()
  fireEvent.submit(screen.getByLabelText('Development Name').closest('form'))
  expect(screen.getByLabelText('Planned Units')).toBeTruthy()
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
  next(); next()
  expect(screen.getByText('Units to create now')).toBeTruthy()
  expect(screen.queryByText('Status')).toBeNull()
  expect(screen.queryByText('Unnamed unit type')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Create Development →' }))
  await waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledTimes(1))
  expect(createDevelopmentWorkspace).toHaveBeenCalledTimes(1)
  expect(createDevelopmentWorkspace.mock.calls[0][0].details.status).toBe('active')
})

it('cancels the Continue click default before replacing it with the submit button', () => {
  open(); details(); next(); next()
  const clickContinues = fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(clickContinues).toBe(false)
  expect(screen.getByRole('button', { name: 'Create Development →' })).toBeTruthy()
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
})

it('generates building and floor stock with explicit allocations and no release phases', async () => {
  const callbacks = open(); details(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Generate stock' }))
  expect(screen.queryByRole('button', { name: 'By phase' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Buildings & floors' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add floor to Building A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add floor to Building A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add building' }))
  next()
  fireEvent.change(screen.getByLabelText('Unit type 1'), { target: { value: 'Apartment' } })
  fireEvent.change(screen.getByLabelText(/Layout name for Apartment/), { target: { value: 'A1' } })
  fireEvent.change(screen.getByLabelText('Size for Apartment / A1'), { target: { value: '80' } })
  fireEvent.change(screen.getByLabelText('List price for Apartment / A1'), { target: { value: '1500000' } })
  fireEvent.change(screen.getByLabelText('Total units for Apartment / A1'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Units in Building A / Ground floor for Apartment / A1'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Units in Building A / Floor 1 for Apartment / A1'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Units in Building B for Apartment / A1'), { target: { value: '2' } })
  next()
  expect(screen.getByText('Stock allocation and unit numbers')).toBeTruthy()
  // Replacing an allocated floor must require allocation again, without leaving
  // an invisible stale target that the user cannot correct.
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove Ground floor from Building A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add floor to Building A' }))
  next(); next()
  expect(screen.getByRole('alert').textContent).toContain('3 assigned')
  fireEvent.change(screen.getByLabelText('Units in Building A / Ground floor for Apartment / A1'), { target: { value: '1' } })
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Generate Units' }))
  expect(screen.getByLabelText('Developer / Organisation')).toBeTruthy()
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create Development →' }))
  await waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledTimes(1))
  const payload = createDevelopmentWorkspace.mock.calls[0][0]
  expect(payload.structureNodes).toHaveLength(4)
  expect(payload.units).toHaveLength(4)
  expect(payload.units.every((unit) => unit.phase === '' && payload.structureNodes.some((node) => node.id === unit.structureNodeId))).toBe(true)
  expect(payload.details).toMatchObject({ status: 'active', totalUnitsExpected: 4 })
  expect(payload.units.map((unit) => unit.unitNumber)).toEqual(['001', '002', '003', '004'])
})

it('blocks incomplete stock on draft save and allows the agent to defer stock instead', async () => {
  const callbacks = open(); details(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Generate stock' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('unit type needs a name')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Set up units later' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledTimes(1))
  expect(createDevelopmentWorkspace.mock.calls[0][0].units).toEqual([])
  expect(createDevelopmentWorkspace.mock.calls[0][0].structureNodes).toEqual([])
})

it('validates developer invitations on draft save after returning to Details', () => {
  open(); details(); next(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Invite New Developer' }))
  fireEvent.change(screen.getByLabelText('Developer company name'), { target: { value: 'Builder' } })
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('company name, contact name, and email')
  expect(screen.getByText('Developer Access')).toBeTruthy()
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
})

it('lets the agent defer access after starting an invitation without saving or sending that invitation', async () => {
  const callbacks = open(); details(); next(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Invite New Developer' }))
  fireEvent.change(screen.getByLabelText('Developer company name'), { target: { value: 'Builder' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add access later' }))
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create Development →' }))
  await waitFor(() => expect(callbacks.onClose).toHaveBeenCalled())
  expect(createDevelopmentWorkspace.mock.calls[0][0].developmentSettings.stakeholderTeams.developers).toEqual([])
  expect(invokeEdgeFunction).not.toHaveBeenCalled()
})

it('requires a valid reservation amount when the deposit default is enabled', () => {
  open(); details(); next(); next()
  fireEvent.click(screen.getByLabelText(/Reservation deposit applies/))
  next()
  expect(screen.getByRole('alert').textContent).toContain('positive reservation deposit amount')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText(/^Reservation Deposit Amount/), { target: { value: '5000' } })
  next()
  expect(screen.getByText('R 5000')).toBeTruthy()
})

it('keeps a saved development visible when area indexing fails and prevents another create', async () => {
  upsertAreaFromAddress.mockRejectedValue(new Error('Area indexing unavailable'))
  const callbacks = open(); review()
  fireEvent.click(screen.getByRole('button', { name: 'Create Development →' }))
  await screen.findByText('The development was saved, but its area directory entry could not be updated.')
  expect(screen.getByRole('link', { name: 'Open development' }).getAttribute('href')).toBe('/developments/saved-development')
  expect(screen.getByRole('button', { name: 'Save Draft' }).disabled).toBe(true)
  expect(callbacks.onClose).not.toHaveBeenCalled()
  expect(callbacks.onCreated).toHaveBeenCalledTimes(1)
  expect(createDevelopmentWorkspace).toHaveBeenCalledTimes(1)
})

it('opens the existing record when some creation setup fails after the development is saved', async () => {
  createDevelopmentWorkspace.mockRejectedValue(Object.assign(new Error('Some unit setup could not be saved.'), { developmentId: 'existing-development' }))
  const callbacks = open(); review()
  fireEvent.click(screen.getByRole('button', { name: 'Create Development →' }))
  await screen.findByText('Some unit setup could not be saved.')
  expect(screen.getByRole('link', { name: 'Open development' }).getAttribute('href')).toBe('/developments/existing-development')
  expect(screen.getByRole('button', { name: 'Create Development →' }).disabled).toBe(true)
  expect(callbacks.onCreated).toHaveBeenCalledWith({ id: 'existing-development', name: 'Willow Park' })
})
