// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Page from '../RentalLandlordLeadWorkspace'
import { listOrganisationUsersForWorkspace } from '../../../lib/settingsApi'
import { assignRentalLead } from '../../../services/rentals/rentalLeadService'
import { createRentalCrmLeadMetadata } from '../../../services/rentals/rentalCrmLeadModel'
import {
  saveRentalLandlordProfile,
  saveRentalLandlordProperty,
} from '../../../services/rentals/rentalLandlordWorkspaceService'
import { createRentalLeadFollowUp } from '../../../services/rentals/rentalLeadFollowUpService'
import { logRentalLeadCommunication } from '../../../services/rentals/rentalLeadCommunicationService'
vi.mock('../../../components/dashboard/PremiumDashboard', () => ({
  MobileDashboardShell: ({ children }) => <div>{children}</div>,
}))
vi.mock('../../../services/rentals/rentalLandlordWorkspaceService', () => ({
  saveRentalLandlordProfile: vi.fn(),
  saveRentalLandlordProperty: vi.fn(),
  saveRentalLandlordDocument: vi.fn(),
  recordRentalLandlordPortfolioMandate: vi.fn(),
}))
vi.mock('../../../services/rentals/rentalPropertyRepository', () => ({
  listRentalProperties: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../../services/rentals/rentalLeadCommunicationService', () => ({
  listRentalLeadCommunications: vi.fn().mockResolvedValue([]),
  logRentalLeadCommunication: vi.fn(),
}))
vi.mock('../../../services/rentals/rentalLeadFollowUpService', () => ({
  createRentalLeadFollowUp: vi.fn(),
  completeRentalLeadFollowUp: vi.fn(),
}))
vi.mock('../../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: vi.fn().mockResolvedValue([]) }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ assignRentalLead: vi.fn().mockResolvedValue(true) }))
const lead = {
  id: 'lead',
  role: 'landlord',
  stage: 'contacted',
  stageLabel: 'Contacted',
  name: 'Landlord Contact',
  phone: '123',
  assignedAgentName: 'Agent Name',
  raw: {
    rawEnquiryPayload: createRentalCrmLeadMetadata({
      organisationId: 'org',
      role: 'landlord',
      legacy: {
        landlordProfile: {
          type: 'trust',
          name: 'Example Trust',
          phone: '123',
          people: [],
        },
        landlordPortfolio: [
          { id: 'p1', address: 'First Road', title: 'First property' },
          { id: 'p2', address: 'Second Road', title: 'Second property' },
        ],
      },
    }),
  },
}
const scope = {
  organisationId: 'org',
  assignedAgentId: 'agent',
  scopeLevel: 'agent',
}
function show(overrides = {}) {
  render(
    <MemoryRouter>
      <Page
        lead={lead}
        scope={scope}
        options={scope}
        actor={{ id: 'agent' }}
        onReload={vi.fn().mockResolvedValue()}
        journeyContent={<p>Next action</p>}
        {...overrides}
      />
    </MemoryRouter>,
  )
}
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
it('shows seller-style landlord header, exact menu and a portfolio with separate property profiles', async () => {
  show()
  expect(screen.getByRole('heading', { name: 'Example Trust' })).toBeTruthy()
  expect(
    screen.getByRole('progressbar', { name: 'Mandate readiness' }),
  ).toBeTruthy()
  for (const name of [
    'Overview',
    'Landlord profile',
    'Portfolio',
    'Appointments',
    'Documents',
    'Activity',
  ])
    expect(screen.getByRole('button', { name, exact: true })).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: 'Portfolio', exact: true }),
  )
  fireEvent.click(screen.getByRole('button', { name: /Second property/ }))
  for (const title of [
    'Property profile',
    'Listing & readiness',
    'Property characteristics',
    'Occupancy & ownership',
  ])
    expect(
      screen.getByRole('heading', { name: title, exact: true }),
    ).toBeTruthy()
  expect(screen.getAllByText('Second Road').length).toBeGreaterThan(0)
  expect(screen.queryByText('First Road')).toBeNull()
})
it('saves entity and people fields, while a failed save leaves the draft available', async () => {
  show()
  fireEvent.click(
    screen.getByRole('button', { name: 'Landlord profile', exact: true }),
  )
  fireEvent.change(
    screen.getByLabelText('Company / trust registration number'),
    { target: { value: 'IT999' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
  fireEvent.change(screen.getByLabelText('Full name'), {
    target: { value: 'Ann Trustee' },
  })
  fireEvent.click(
    screen.getByLabelText('Authorised to sign the rental mandate'),
  )
  saveRentalLandlordProfile.mockRejectedValueOnce(
    new Error('statement timeout'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord profile' }))
  await screen.findByText('statement timeout')
  expect(
    screen.getByLabelText('Company / trust registration number').value,
  ).toBe('IT999')
  expect(saveRentalLandlordProfile).toHaveBeenCalledWith(
    'lead',
    expect.objectContaining({
      type: 'trust',
      registrationNumber: 'IT999',
      people: [
        expect.objectContaining({
          name: 'Ann Trustee',
          signingAuthority: true,
        }),
      ],
    }),
    expect.objectContaining({ organisationId: 'org' }),
  )
})
it('adds a property with Yes/No cards and retains it after failure for a retry', async () => {
  show()
  fireEvent.click(
    screen.getByRole('button', { name: 'Portfolio', exact: true }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add property' }))
  fireEvent.change(screen.getByLabelText('Property address'), {
    target: { value: 'Third Road' },
  })
  fireEvent.change(screen.getByLabelText('Expected monthly rent'), {
    target: { value: '12000' },
  })
  expect(
    screen.getAllByRole('button', { name: 'Yes', exact: true }),
  ).toHaveLength(3)
  saveRentalLandlordProperty.mockRejectedValueOnce(new Error('save failed'))
  fireEvent.click(screen.getByRole('button', { name: 'Save property' }))
  await screen.findByText('save failed')
  expect(screen.getByLabelText('Property address').value).toBe('Third Road')
  fireEvent.click(screen.getByRole('button', { name: 'Save property' }))
  await waitFor(() =>
    expect(saveRentalLandlordProperty).toHaveBeenCalledTimes(2),
  )
  expect(saveRentalLandlordProperty.mock.calls[0][1].id).toBe(
    saveRentalLandlordProperty.mock.calls[1][1].id,
  )
})
it('connects appointments and activity to the landlord lead', async () => {
  show()
  fireEvent.click(
    screen.getByRole('button', { name: 'Appointments', exact: true }),
  )
  fireEvent.change(screen.getByLabelText('Date and time'), {
    target: { value: '2026-11-02T10:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Schedule appointment' }))
  await waitFor(() =>
    expect(createRentalLeadFollowUp).toHaveBeenCalledWith(
      lead,
      expect.objectContaining({ dueDate: '2026-11-02T10:00' }),
      expect.objectContaining({ organisationId: 'org' }),
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Activity', exact: true }))
  fireEvent.change(screen.getByLabelText('Activity summary'), {
    target: { value: 'Discussed appraisal' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Log activity' }))
  await waitFor(() =>
    expect(logRentalLeadCommunication).toHaveBeenCalledWith(
      lead,
      expect.objectContaining({ summary: 'Discussed appraisal' }),
      expect.objectContaining({ organisationId: 'org' }),
    ),
  )
})

it('reports a completed save distinctly when refreshing the workspace fails', async () => {
  saveRentalLandlordProfile.mockResolvedValueOnce(true)
  show({
    onReload: vi.fn().mockRejectedValue(new Error('refresh unavailable')),
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Landlord profile', exact: true }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord profile' }))
  await screen.findByText(/Saved, but the workspace could not refresh/)
  expect(screen.getByRole('status').textContent).toBe('Landlord profile saved.')
  expect(saveRentalLandlordProfile).toHaveBeenCalledTimes(1)
})

it('shows the active landlord milestone across workspace tabs', async () => {
  show({ lead: { ...lead, stage: 'mandate_signed' } })
  const journey = screen.getByRole('list', { name: 'Landlord journey stages' })
  expect(journey.querySelector('[aria-current="step"]').textContent).toContain('Mandate signed')
  expect(within(journey).getAllByRole('listitem')).toHaveLength(8)
  fireEvent.click(screen.getByRole('button', { name: 'Landlord profile', exact: true }))
  expect(screen.getByRole('list', { name: 'Landlord journey stages' })).toBeTruthy()
})
it('limits landlord assignment choices to active agents in the manager branch and saves the selection', async () => {
  listOrganisationUsersForWorkspace.mockResolvedValueOnce([
    { userId: 'new-agent', fullName: 'New Agent', email: 'new@example.test', organisationId: 'org', branchId: 'branch', status: 'active' },
    { userId: 'other-branch', fullName: 'Other Branch', organisationId: 'org', branchId: 'other', status: 'active' },
    { userId: 'inactive', fullName: 'Inactive Agent', organisationId: 'org', branchId: 'branch', status: 'inactive' },
    { userId: 'other-org', fullName: 'Other Organisation', organisationId: 'other', branchId: 'branch', status: 'active' },
  ])
  const onReload = vi.fn().mockResolvedValue()
  show({ scope: { organisationId: 'org', branchId: 'branch', scopeLevel: 'branch' }, onReload })
  const select = await screen.findByRole('combobox', { name: 'Assign landlord lead' })
  await waitFor(() => expect(within(select).getByRole('option', { name: 'New Agent' })).toBeTruthy())
  for (const name of ['Other Branch', 'Inactive Agent', 'Other Organisation']) expect(within(select).queryByRole('option', { name })).toBeNull()
  fireEvent.change(select, { target: { value: 'new-agent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save assignment' }))
  await waitFor(() => expect(assignRentalLead).toHaveBeenCalledWith('lead', 'new-agent', expect.objectContaining({ organisationId: 'org', scope: expect.objectContaining({ scopeLevel: 'branch', branchId: 'branch' }) })))
  expect(await screen.findByText('Lead assignment saved.')).toBeTruthy()
  expect(onReload).toHaveBeenCalled()
})
it('keeps assignment read-only for agents', async () => {
  show()
  expect(screen.getByRole('combobox', { name: 'Assign landlord lead' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Save assignment' })).toBeNull()
})
