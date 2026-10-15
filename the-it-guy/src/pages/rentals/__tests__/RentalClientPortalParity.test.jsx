// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RentalTenantPortalPage from '../RentalTenantPortalPage'
import RentalLandlordPortalPage from '../RentalLandlordPortalPage'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-session' } } }) } } }))
vi.mock('../../../components/rentals/RentalClientPortalShell', () => ({ default: ({ children }) => <main>{children}</main> }))
const journey = { tenancyStatus: 'draft', leaseStatus: 'awaiting_tenant', signatures: [{ id: 'tenant', role: 'tenant', status: 'pending' }, { id: 'landlord', role: 'landlord', status: 'signed' }], payments: [{ id: 'deposit', type: 'deposit', status: 'required', requiredAmount: 22000, receivedAmount: 0 }], handover: { status: 'in_progress', completedItems: 2, totalItems: 5 } }
const document = { id: 'doc-1', label: 'Saved agreement.pdf', category: 'lease', status: 'awaiting_tenant', available: true }
const tenant = { tenancy: { id: 'tenancy-1', tenantName: 'Saved Tenant', status: 'draft' }, property: { name: 'Saved Property', addressLine1: '12 Saved Road', city: 'Pretoria', unitLabel: 'Unit A' }, lease: { status: 'awaiting_tenant', monthlyRent: 11000 }, journey, documents: [document], maintenanceRequests: [], requests: [] }
const landlord = { property: { name: 'Saved Property' }, mandate: { mandate_status: 'active' }, units: [{ id: 'unit-1', unit_label: 'Unit A', status: 'lease_pending' }], tenancies: [{ id: 'tenancy-1', unitId: 'unit-1', unitLabel: 'Unit A', journey }], leaseDocuments: [document], documents: [], maintenanceRequests: [], listings: [], vacancies: [], decisions: [] }
const response = (body, status = 200) => ({ ok: status < 400, json: async () => body })
function mount(Page, section, props = {}) { return render(<MemoryRouter initialEntries={[`/portal/token?section=${section}`]}><Routes><Route path="/portal/:token" element={<Page {...props} />} /></Routes></MemoryRouter>) }
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); vi.spyOn(window, 'open').mockReturnValue({ opener: {}, location: { href: '' }, close: vi.fn() }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('shows actual tenant progress and opens a private file using the signed-in relationship', async () => {
  fetch.mockImplementation(async (_url, options) => options?.method === 'POST' ? response({ url: 'https://fixture.test/private/document' }) : response(tenant))
  mount(RentalTenantPortalPage, 'documents', { accountMembershipId: 'membership-1' })
  await screen.findAllByText('Saved agreement.pdf')
  fireEvent.click(screen.getByRole('button', { name: /Saved agreement.pdf Awaiting Tenant/ }))
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/rentals/client-portal', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fixture-session' }), body: JSON.stringify({ action: 'open_document', documentId: 'doc-1', audience: 'tenant', membershipId: 'membership-1' }) })))
  expect(window.open).toHaveBeenCalledWith('', '_blank')
})

it('does not label a tenant lease as active before the saved signatures and handover are complete', async () => {
  fetch.mockResolvedValue(response(tenant)); mount(RentalTenantPortalPage, 'lease')
  await screen.findByText('Awaiting tenant signatures')
  expect(screen.queryByText('Your lease is active')).toBeNull()
  expect(screen.getByText('1 of 2 received')).toBeTruthy()
  expect(screen.getByText('In Progress · 2 of 5 items complete')).toBeTruthy()
})

it('keeps the maintenance form and receipt after a failed save, then retries without a duplicate', async () => {
  let attempts = 0
  fetch.mockImplementation(async (_url, options) => {
    if (!options?.method) return response(tenant)
    attempts++
    if (attempts === 1) return response({ error: 'Fixture response lost' }, 500)
    return response({ maintenanceRequest: { id: 'request-1', category: 'plumbing', priority: 'routine', description: 'Kitchen tap\n\nWater is leaking under the sink.', status: 'submitted', reported_at: '2026-10-14T10:00:00Z', events: [] } })
  })
  mount(RentalTenantPortalPage, 'maintenance', { accountMembershipId: 'membership-1' })
  fireEvent.click((await screen.findAllByRole('button', { name: /Report an issue/ }))[0])
  fireEvent.change(screen.getByLabelText('What needs attention?'), { target: { value: 'Kitchen tap' } })
  fireEvent.change(screen.getByLabelText('Describe the issue'), { target: { value: 'Water is leaking under the sink.' } })
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
  fireEvent.click(screen.getByRole('button', { name: /Submit request/ }))
  await screen.findByRole('alert')
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Submit request/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const bodies = fetch.mock.calls.filter(([, options]) => options?.method === 'POST').map(([, options]) => JSON.parse(options.body))
  expect(bodies).toHaveLength(2); expect(bodies[0].requestId).toBe(bodies[1].requestId)
  expect(bodies[1]).toMatchObject({ audience: 'tenant', membershipId: 'membership-1', requestType: 'maintenance' })
})

it('uses saved landlord documents and instructions instead of sample data in live tabs', async () => {
  fetch.mockResolvedValue(response(landlord)); mount(RentalLandlordPortalPage, 'documents')
  await screen.findAllByText('Saved agreement.pdf')
  expect(screen.queryByText(/Harbour Heights|September rent invoice/)).toBeNull()
  cleanup(); mount(RentalLandlordPortalPage, 'messages', { accountMembershipId: 'membership-2' })
  await screen.findByText('Send an instruction')
  expect(screen.getByLabelText('Instruction')).toBeTruthy()
})

it('clears old property state when an account relationship changes and access is denied', async () => {
  fetch.mockImplementation(async url => url.includes('membership-1') ? response(tenant) : response({ error: 'Access revoked' }, 403))
  function App({ id }) { return <MemoryRouter><RentalTenantPortalPage accountMembershipId={id} /></MemoryRouter> }
  const view = render(<App id="membership-1" />)
  await screen.findByText('Saved Property · Unit A')
  view.rerender(<App id="membership-2" />)
  await screen.findByText('Access revoked')
  expect(screen.queryByText('Saved Property · Unit A')).toBeNull()
})
