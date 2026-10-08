// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
function next() { fireEvent.click(screen.getByRole('button', { name: 'Next' })) }
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

it('cancels the Next click default before replacing it with the submit button', () => {
  open(); details(); next(); next()
  const clickContinues = fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(clickContinues).toBe(false)
  expect(screen.getByRole('button', { name: 'Create Development →' })).toBeTruthy()
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
})

it('generates building and floor stock with explicit allocations and no release phases', async () => {
  const callbacks = open(); details(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' }))
  next()
  expect(screen.queryByRole('button', { name: 'By phase' })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Buildings + Units' }))
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
  fireEvent.click(screen.getByRole('button', { name: 'Use these units' }))
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
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' }))
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('unit type needs a name')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Set up units later' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledTimes(1))
  expect(createDevelopmentWorkspace.mock.calls[0][0].units).toEqual([])
  expect(createDevelopmentWorkspace.mock.calls[0][0].structureNodes).toEqual([])
})

it('keeps three unit methods below Planned Units and opens setup only when the agent clicks Next', () => {
  const callbacks = open(); details(); next()
  const method = screen.getByRole('group', { name: 'Unit Configuration Method' })
  expect(within(method).getAllByRole('button')).toHaveLength(3)
  expect(screen.getByLabelText('Planned Units').compareDocumentPosition(method) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Planned Units'), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' }))
  expect(screen.getByRole('button', { name: 'Set up units now' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(screen.getByRole('list', { name: 'Development setup progress' })).getAllByRole('listitem')).toHaveLength(5)
  expect(screen.queryByText('Physical structure')).toBeNull()
  next()
  expect(screen.getByText('Physical structure')).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Development setup progress' }).querySelector('[aria-current="step"]').textContent).toContain('Unit setup')
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByLabelText('Planned Units').value).toBe('12')
  expect(screen.getByRole('button', { name: 'Set up units now' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Import units later' }))
  expect(within(screen.getByRole('list', { name: 'Development setup progress' })).getAllByRole('listitem')).toHaveLength(4)
  next()
  expect(screen.getByText('Developer Access')).toBeTruthy()
  expect(callbacks.onClose).not.toHaveBeenCalled()
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
})

it('preserves entered unit types when returning to the method selector and resuming unit setup', () => {
  open(); details(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' })); next(); next()
  fireEvent.change(screen.getByLabelText('Unit type 1'), { target: { value: 'Townhouse' } })
  fireEvent.click(screen.getByRole('button', { name: 'Back to Units' }))
  fireEvent.click(screen.getByRole('button', { name: 'Import units later' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' })); next()
  expect(screen.getByLabelText('Unit type 1').value).toBe('Townhouse')
})

it('returns draft validation errors to Sales setup even when Unit setup adds a step', () => {
  open(); details(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' })); next(); next()
  fireEvent.change(screen.getByLabelText('Unit type 1'), { target: { value: 'Apartment' } })
  fireEvent.change(screen.getByLabelText('Layout name for Apartment / Layout 1'), { target: { value: 'A1' } })
  fireEvent.change(screen.getByLabelText('Size for Apartment / A1'), { target: { value: '80' } })
  fireEvent.change(screen.getByLabelText('List price for Apartment / A1'), { target: { value: '1500000' } })
  fireEvent.change(screen.getByLabelText('Total units for Apartment / A1'), { target: { value: '2' } })
  next(); fireEvent.click(screen.getByRole('button', { name: 'Use these units' }))
  fireEvent.click(screen.getByRole('button', { name: 'Invite New Developer' }))
  fireEvent.change(screen.getByLabelText('Developer company name'), { target: { value: 'Builder' } })
  for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByLabelText('Development Name')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  expect(screen.getByRole('alert').textContent).toContain('company name, contact name, and email')
  expect(screen.getByText('Developer Access')).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Development setup progress' }).querySelector('[aria-current="step"]').textContent).toContain('Sales setup')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
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

it('offers two structure choices and keeps internal storeys with the saved duplex layout', async () => {
  const callbacks = open(); details(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Set up units now' })); next()
  const structureChoices = within(screen.getByRole('group', { name: 'How are the units organised?' })).getAllByRole('radio')
  expect(structureChoices).toHaveLength(2)
  expect(screen.getByRole('radio', { name: 'Units', exact: true }).checked).toBe(true)
  expect(screen.getByRole('radio', { name: 'Buildings + Units', exact: true })).toBeTruthy()
  expect(screen.queryByRole('radio', { name: 'Blocks / clusters' })).toBeNull()
  next()
  fireEvent.change(screen.getByLabelText('Unit type 1'), { target: { value: 'Duplex' } })
  fireEvent.change(screen.getByLabelText(/Layout name for Duplex/), { target: { value: 'D1' } })
  fireEvent.change(screen.getByLabelText('Size for Duplex / D1'), { target: { value: '120' } })
  fireEvent.change(screen.getByLabelText('List price for Duplex / D1'), { target: { value: '1800000' } })
  fireEvent.change(screen.getByLabelText('Total units for Duplex / D1'), { target: { value: '3' } })
  const storeys = screen.getByLabelText('Number of storeys for Duplex / D1')
  expect(storeys.value).toBe('1')
  fireEvent.change(storeys, { target: { value: '1.5' } }); next()
  expect(screen.getByRole('alert').textContent).toContain('whole number of storeys')
  expect(createDevelopmentWorkspace).not.toHaveBeenCalled()
  fireEvent.change(storeys, { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Back to Units' })); next()
  expect(screen.getByLabelText('Number of storeys for Duplex / D1').value).toBe('2')
  next()
  const table = screen.getByRole('table', { name: 'Stock allocation and unit numbers' })
  expect(within(table).getByRole('columnheader', { name: 'Storeys per unit' })).toBeTruthy()
  expect(within(table).getByRole('cell', { name: '2', exact: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Use these units' })); next()
  fireEvent.click(screen.getByRole('button', { name: 'Create Development →' }))
  await waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledTimes(1))
  const payload = createDevelopmentWorkspace.mock.calls[0][0]
  expect(payload.structureNodes).toEqual([])
  expect(payload.units).toHaveLength(3)
  const layout = payload.productCatalogue.floorplans[0]
  expect(layout.storeys).toBe(2)
  expect(payload.units.every((unit) => unit.catalogueFloorplanId === layout.id && unit.structureNodeId === null)).toBe(true)
})
