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
import { listRentalUnits } from '../../../services/rentals/rentalUnitRepository.js'
import { listRentalProperties } from '../../../services/rentals/rentalPropertyRepository'
vi.mock('../../../services/rentals/rentalUnitRepository.js', () => ({ listRentalUnits: vi.fn().mockResolvedValue([]) }))
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
vi.mock('../../../services/rentals/rentalLandlordOnboardingService.js', () => ({
  requestRentalLandlordOnboarding: vi.fn().mockResolvedValue({ onboarding: {
    version: 1, status: 'draft', data: { profile: { name: 'Example Trust' }, portfolio: [] }, requirements: [], documents: [], accessLinks: [],
  } }),
}))
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
it('opens a saved landlord listing link even when the portfolio has no listing reference', () => {
  show({ lead: { ...lead, relationships: { listingId: 'saved-rental' } } })
  expect(screen.getByRole('link', { name: 'Open linked rental listing' }).getAttribute('href')).toBe('/agent/rentals/listings/saved-rental/overview')
})
it('links the saved landlord summary to its client profile through the lead identity', () => {
  show()
  expect(screen.getByRole('link', { name: 'Open landlord profile' }).getAttribute('href')).toBe('/clients/lead%3Alead')
  const summary = screen.getByRole('heading', { name: 'Landlord profile', exact: true }).closest('section')
  expect(within(summary).getByText('Example Trust')).toBeTruthy()
  expect(within(summary).queryByText('Landlord Contact')).toBeNull()
  fireEvent.click(within(summary).getByRole('button', { name: 'Edit profile' }))
  expect(screen.getByLabelText('Full name / entity name').value).toBe('Example Trust')
})
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
  fireEvent.click(screen.getByRole('button', { name: /^Owners & representatives/ }))
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
it('selects a saved unit within the chosen managed property and carries that identity into the property save', async () => {
  listRentalProperties.mockResolvedValue([{ id: 'managed', name: 'Managed home', address: { line1: 'Saved Road' } }])
  listRentalUnits.mockResolvedValue([{ id: 'saved-unit', unitLabel: 'A2', bedrooms: 2, bathrooms: 1, parkingCount: 1 }])
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Portfolio', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Add property' }))
  await screen.findByRole('option', { name: 'Managed home · Saved Road' })
  fireEvent.change(screen.getByRole('combobox', { name: /Managed rental property/ }), { target: { value: 'managed' } })
  await screen.findByRole('option', { name: 'A2' })
  fireEvent.change(screen.getByLabelText('Managed rental unit'), { target: { value: 'saved-unit' } })
  fireEvent.change(screen.getByLabelText('Property address'), { target: { value: 'Saved Road' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save property' }))
  await waitFor(() => expect(saveRentalLandlordProperty).toHaveBeenCalledWith('lead', expect.objectContaining({ canonicalPropertyId: 'managed', canonicalUnitId: 'saved-unit', unitNumber: 'A2', bedrooms: 2 }), expect.anything()))
  expect(listRentalUnits).toHaveBeenCalledWith({ propertyId: 'managed' })
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
  saveRentalLandlordProfile.mockImplementationOnce(async (_id, profile) => ({onboarding:{consistency:{synced:true},data:{profile,portfolio:[]}}}))
  show({
    onReload: vi.fn().mockRejectedValue(new Error('refresh unavailable')),
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Landlord profile', exact: true }),
  )
  fireEvent.change(screen.getByLabelText('Company / trust registration number'), {target:{value:'IT-updated'}})
  fireEvent.click(screen.getByRole('button', { name: 'Save landlord profile' }))
  await screen.findByText(/Profile saved. The workspace refresh needs a retry./)
  expect(screen.getByRole('status').textContent).toBe('All profile changes saved')
  expect(saveRentalLandlordProfile).toHaveBeenCalledTimes(1)
})

it('shows the active landlord milestone only on Overview and restores it when returning', async () => {
  show({ lead: { ...lead, stage: 'mandate_signed' } })
  const journey = screen.getByRole('list', { name: 'Landlord journey stages' })
  expect(journey.querySelector('[aria-current="step"]').textContent).toContain('Mandate signed')
  expect(within(journey).getAllByRole('listitem')).toHaveLength(8)
  for (const name of ['Landlord profile', 'Portfolio', 'Appointments', 'Documents', 'Activity']) {
    fireEvent.click(screen.getByRole('button', { name, exact: true }))
    expect(screen.queryByRole('list', { name: 'Landlord journey stages' })).toBeNull()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Overview', exact: true }))
  expect(screen.getByRole('list', { name: 'Landlord journey stages' }).querySelector('[aria-current="step"]').textContent).toContain('Mandate signed')
})
it('keeps Documents in the landlord workspace and collapses the separate reference form without an empty duplicate document card', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Documents', exact: true }))
  await screen.findByRole('region', { name: 'Landlord document checklist' })
  expect(screen.getByRole('heading', { name: 'Example Trust', level: 1 })).toBeTruthy()
  expect(screen.getByRole('navigation', { name: 'Landlord lead workspace' })).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Landlord journey stages' })).toBeNull()
  expect(within(screen.getByRole('region', { name: 'Landlord document checklist' })).getAllByRole('heading', { name: 'Documents', exact: true })).toHaveLength(1)
  expect(screen.queryByRole('heading', { name: 'Saved references and linked listings' })).toBeNull()
  const reference = screen.getByText('Add a document reference').closest('details')
  expect(reference.open).toBe(false)
  fireEvent.click(screen.getByText('Add a document reference'))
  expect(reference.open).toBe(true)
  expect(screen.getByLabelText('Document name')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Save document reference' })).toBeTruthy()
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
it('shows the assigned agent profile photo to agents while keeping reassignment locked', async () => {
  listOrganisationUsersForWorkspace.mockResolvedValueOnce([
    { userId: 'agent', fullName: 'Saved Agent', email: 'agent@example.test', avatarUrl: '/saved-agent-photo.jpg', organisationId: 'org', branchId: 'branch', status: 'active' },
  ])
  show({ lead: { ...lead, assignedAgentId: 'agent' } })
  const photo = await screen.findByRole('img', { name: 'Saved Agent profile photo' })
  expect(photo.getAttribute('src')).toBe('/saved-agent-photo.jpg')
  expect(screen.getByRole('combobox', { name: 'Assign landlord lead' }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Save assignment' })).toBeNull()
  fireEvent.error(photo)
  expect(screen.queryByRole('img', { name: 'Saved Agent profile photo' })).toBeNull()
  expect(screen.getByText('SA')).toBeTruthy()
})

it('resolves a foreign company with the same conditional fields as the public and listing forms', () => {
 show()
 fireEvent.click(screen.getByRole('button', { name: 'Landlord profile', exact: true }))
 fireEvent.change(screen.getByLabelText('Landlord type'), { target: { value: 'foreign_owner' } })
 fireEvent.change(screen.getByLabelText('Legal structure'), { target: { value: 'company' } })
 expect(screen.getByLabelText('Company / trust registration number')).toBeTruthy()
 expect(screen.queryByLabelText('ID / passport number')).toBeNull()
 expect(screen.getByLabelText('Signatory ID / passport number')).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Legal structure'), { target: { value: 'individual' } })
 expect(screen.queryByLabelText('Company / trust registration number')).toBeNull()
 expect(screen.getByLabelText('ID / passport number')).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Marital status'), { target: { value: 'married' } })
 fireEvent.change(screen.getByLabelText('Marital regime'), { target: { value: 'in_community' } })
 expect(screen.getByLabelText('Spouse ID / passport number')).toBeTruthy()
})

it('reports a hidden invalid person email on manual save and retains the draft',async()=>{
 show()
 fireEvent.click(screen.getByRole('button',{name:'Landlord profile',exact:true}))
 fireEvent.click(screen.getByRole('button',{name:/^Owners & representatives/}))
 fireEvent.click(screen.getByRole('button',{name:'Add person'}))
 fireEvent.change(screen.getByRole('textbox',{name:'Person 1 Full name'}),{target:{value:'Draft Person'}})
 fireEvent.change(screen.getByRole('textbox',{name:'Person 1 Email'}),{target:{value:'incomplete-email'}})
 fireEvent.click(screen.getByRole('button',{name:/^Owners & representatives/}))
 fireEvent.click(screen.getByRole('button',{name:'Save landlord profile'}))
 expect((await screen.findByRole('alert',{}, {timeout:400})).textContent).toContain('Enter a valid email for each person.')
 expect(saveRentalLandlordProfile).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:/^Owners & representatives/}))
 expect(screen.getByRole('textbox',{name:'Person 1 Email'}).value).toBe('incomplete-email')
})
