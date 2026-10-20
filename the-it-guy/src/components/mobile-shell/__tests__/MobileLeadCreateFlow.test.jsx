// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileLeadCreateFlow from '../MobileLeadCreateFlow.jsx'
import MobileLeadCreateProvider from '../MobileLeadCreateProvider.jsx'
import { useMobileLeadCreate } from '../mobileLeadCreateContext.js'
import { createAgencyCrmLeadRecord, createAgencyCrmLeadActivity } from '../../../lib/agencyCrmRepository'
import { createRentalLead } from '../../../services/rentals/rentalLeadService.js'
const mock = vi.hoisted(() => ({ workspace: {}, seller: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mock.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => ({ organisation: { id: 'org' } }) }))
vi.mock('../../../lib/organisationAccess', () => ({ canAccessPrincipalExperience: () => false }))
vi.mock('../../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: vi.fn().mockResolvedValue([]) }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadRecord: vi.fn(), createAgencyCrmLeadActivity: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../services/rentals/rentalLeadService.js', () => ({ createRentalLead: vi.fn() }))
vi.mock('../../../services/privateListingService.js', () => ({ getOrganisationPrivateListings: vi.fn().mockResolvedValue([{ id: 'listing', title: '18 Oak Avenue', status: 'active' }]) }))
vi.mock('../../leads/SellerLeadCreateDialog.jsx', () => ({ default: props => { mock.seller(props); return <div role="dialog" aria-label="Create Seller Lead">Seller desktop form</div> } }))
const close = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mock.workspace = { role: 'agent', profile: { id: 'agent', fullName: 'Alex Agent', email: 'alex@example.test' }, currentWorkspace: { id: 'org' }, businessWorkspaceSplitEnabled: true, availableBusinessWorkspaceIds: ['sales', 'rentals'] }
  createAgencyCrmLeadRecord.mockResolvedValue({ leadId: 'saved' })
  createRentalLead.mockResolvedValue({ id: 'saved-rental' })
})
afterEach(cleanup)
function setup(props = {}) { return render(<MemoryRouter initialEntries={['/mobile/home']}><MobileLeadCreateFlow onClose={close} {...props} /></MemoryRouter>) }
function Trigger() { const { openLeadCreate } = useMobileLeadCreate(); const location = useLocation(); return <><button onClick={openLeadCreate}>Add lead from home</button><output aria-label="Route">{location.pathname}</output></> }
function fillBuyer() {
  for (const [name, value] of [['First name', 'Sarah'], ['Last name', 'Jones'], ['Mobile', '0821234567'], ['Email', 'sarah@example.test']]) fireEvent.change(screen.getByLabelText(name), { target: { value } })
}

it('opens directly over Home, with desktop buyer fields and no draft labels', async () => {
  render(<MemoryRouter initialEntries={['/mobile/home']}><MobileLeadCreateProvider><Trigger /></MobileLeadCreateProvider></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Add lead from home' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Buyer / }))
  await screen.findByRole('dialog', { name: 'New buyer lead' })
  expect(screen.getByLabelText('Route').textContent).toBe('/mobile/home')
  expect(screen.getByLabelText('First name')).toBeTruthy()
  expect(screen.getByLabelText('Last name')).toBeTruthy()
  expect(screen.getByLabelText('Mobile')).toBeTruthy()
  expect(screen.getByLabelText('Email')).toBeTruthy()
  expect(screen.getByLabelText('Lead source')).toBeTruthy()
  expect(screen.getByLabelText('Listing')).toBeTruthy()
  expect(screen.queryByText('Lead Capture')).toBeNull()
  expect(screen.queryByText(/local draft/)).toBeNull()
  expect(screen.queryByText(/Capture the contact details now/)).toBeNull()
})

it('saves a buyer through the desktop repository and closes after confirmation', async () => {
  setup({ initialType: 'buyer' })
  fillBuyer()
  await waitFor(() => expect(screen.getByLabelText('Listing').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Listing'), { target: { value: 'listing' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Lead' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(createAgencyCrmLeadRecord).toHaveBeenCalledWith('org', expect.objectContaining({ leadCategory: 'buyer', listingId: 'listing', assignedUserId: 'agent', stage: 'New Lead', contact: expect.objectContaining({ firstName: 'Sarah', phone: '0821234567', email: 'sarah@example.test' }) }), expect.objectContaining({ actor: expect.objectContaining({ id: 'agent' }) }))
  expect(createAgencyCrmLeadActivity).toHaveBeenCalled()
})

it('keeps buyer values visible when saving fails', async () => {
  createAgencyCrmLeadRecord.mockRejectedValueOnce(new Error('Save unavailable'))
  setup({ initialType: 'buyer' })
  fillBuyer()
  fireEvent.click(screen.getByRole('button', { name: 'Create Lead' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Save unavailable')
  expect(screen.getByLabelText('First name').value).toBe('Sarah')
  expect(close).not.toHaveBeenCalled()
})

it('reuses the desktop seller capture form', async () => {
  setup({ initialType: 'seller' })
  await screen.findByRole('dialog', { name: 'Create Seller Lead' })
  expect(mock.seller).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'org', lockPrimaryAgent: true, assignedAgent: expect.objectContaining({ id: 'agent' }) }))
})

it('creates a tenant with the canonical rental service and rental classification', async () => {
  setup({ initialType: 'tenant' })
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sarah' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0821234567' } })
  fireEvent.change(screen.getByLabelText('Desired area'), { target: { value: 'Waverley' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Tenant Lead' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(createRentalLead).toHaveBeenCalledWith(expect.objectContaining({ role: 'tenant', firstName: 'Sarah', desiredArea: 'Waverley' }), expect.objectContaining({ organisationId: 'org', actor: expect.objectContaining({ id: 'agent' }) }))
})

it('uses the landlord desktop fields and correct submit label', () => {
  setup({ initialType: 'landlord' })
  expect(screen.getByRole('dialog', { name: 'New landlord lead' })).toBeTruthy()
  expect(screen.getByText('Expected monthly rent')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Add Landlord Lead' })).toBeTruthy()
  expect(screen.queryByText('Desired area')).toBeNull()
})

it('blocks rental capture when the current workspace lacks rental access', () => {
  mock.workspace.availableBusinessWorkspaceIds = ['sales']
  setup({ initialType: 'tenant' })
  expect(screen.getByRole('alert').textContent).toContain('not available')
  expect(createRentalLead).not.toHaveBeenCalled()
})
