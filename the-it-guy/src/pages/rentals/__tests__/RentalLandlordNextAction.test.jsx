// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Page from '../RentalLeadWorkspacePage'
import { createRentalCrmLeadMetadata } from '../../../services/rentals/rentalCrmLeadModel'

const api = vi.hoisted(() => ({ load: vi.fn(), advance: vi.fn(), sent: vi.fn(), workspace: { workspace: { id: 'org' }, profile: { id: 'agent' }, workspaceRole: 'owner' } }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => api.workspace }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ getRentalLeadWorkspace: api.load, advanceRentalLead: api.advance }))
vi.mock('../../../services/rentals/rentalLandlordWorkspaceService', () => ({ recordRentalLandlordMandateSent: api.sent }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ listPersistedRentalApplicationsForLead: vi.fn(), savePersistedRentalApplication: vi.fn() }))
vi.mock('../../../services/rentals/rentalTenantApplicationService.js', () => ({ listRentalTenantApplicationChoices: vi.fn(), prepareRentalTenantApplication: vi.fn(), issueRentalTenantApplicationInvite: vi.fn(), revokeRentalTenantApplicationInvite: vi.fn() }))
vi.mock('../RentalLandlordLeadWorkspace', () => ({ default: ({ journeyContent, parentError, onMandateUploaded }) => <><h1>Landlord next action</h1>{parentError ? <p role="alert">{parentError}</p> : null}{journeyContent}{onMandateUploaded ? <button onClick={() => void onMandateUploaded({ subjectId: 'p', purpose: 'signed_mandate' })}>Finish saved mandate upload</button> : null}</> }))
vi.mock('../RentalTenantLeadWorkspace', () => ({ default: () => null }))
let lead
const property = { id: 'p', title: 'First home', canonicalPropertyId: 'managed', mandateId: 'mandate' }
function Location() { const location = useLocation(); return <p data-testid="location">{location.pathname}{location.search}</p> }
function start(stage, overrides = {}) {
  lead = { id: 'lead', role: 'landlord', stage, name: 'Saved Landlord', relationships: {}, raw: { rawEnquiryPayload: createRentalCrmLeadMetadata({ organisationId: 'org', role: 'landlord', stage, legacy: { landlordPortfolio: [property] } }) }, ...overrides }
  render(<MemoryRouter initialEntries={['/agent/rentals/pipeline/leads/lead']}><Location /><Routes><Route path="/agent/rentals/pipeline/leads/:leadId" element={<Page />} /><Route path="*" element={<p>Saved record destination</p>} /></Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks()
  api.load.mockImplementation(async () => ({ lead }))
  api.advance.mockImplementation(async (_, context) => { lead = { ...lead, stage: context.toStage }; return lead })
  api.sent.mockImplementation(async () => { lead.raw.rawEnquiryPayload.landlordMandateDispatches = { p: { sentAt: '2026-10-15T08:00:00Z', sentBy: 'agent' } } })
})
afterEach(cleanup)

it.each([
  ['new', ['Mark as reviewed']], ['contacted', ['Mark as contacted']],
  ['appraisal_scheduled', ['Mark as complete', 'Schedule appointment']], ['appraisal_completed', ['Mark as complete']],
  ['mandate_pending', ['Mark as sent', 'Mark as completed']], ['mandate_signed', ['Upload mandate']],
  ['listing_ready', ['Create draft listing']], ['listing_created', ['View listing']],
])('shows the requested actions at %s', async (stage, labels) => {
  start(stage, { relationships: { listingId: 'listing' } })
  for (const label of labels) expect(await screen.findByRole('button', { name: label, exact: true })).toBeTruthy()
})
it('reviews New, confirms Contacted without inventing an appraisal date, and opens appointment scheduling', async () => {
  start('new')
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as reviewed' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as contacted' }))
  await screen.findByRole('button', { name: 'Schedule appointment' })
  expect(api.advance.mock.calls[0][1]).toMatchObject({ toStage: 'contacted', actor: { id: 'agent' } })
  expect(api.advance.mock.calls[1][1]).toMatchObject({ toStage: 'appraisal_scheduled', evidence: { actionKey: 'mark_contacted' } })
  expect(api.advance.mock.calls[1][1].evidence.scheduledFor).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Schedule appointment' }))
  expect(screen.getByTestId('location').textContent).toContain('tab=Appointments')
})
it('records sent without advancing and completes against the saved mandate identity', async () => {
  start('mandate_pending')
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as sent' }))
  await screen.findByText(/Recorded as sent/)
  expect(api.sent).toHaveBeenCalledWith('lead', 'p', expect.objectContaining({ organisationId: 'org' }))
  expect(api.advance).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Mark as sent' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Mark as completed' }))
  await screen.findByRole('button', { name: 'Upload mandate' })
  expect(api.advance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toStage: 'mandate_signed', relationships: { propertyId: 'managed', mandateId: 'mandate' } }))
})
it('opens signed mandate capture when no signed mandate has been recorded', async () => {
  start('mandate_pending', { raw: { rawEnquiryPayload: { landlordPortfolio: [{ id: 'p', address: 'First home' }] } } })
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as completed' }))
  expect(screen.getByTestId('location').textContent).toContain('tab=Portfolio&property=p')
  expect(api.advance).not.toHaveBeenCalled()
})
it('opens the property-specific mandate uploader and moves to Listing ready after the saved-upload callback', async () => {
  start('mandate_signed')
  fireEvent.click(await screen.findByRole('button', { name: 'Upload mandate' }))
  expect(screen.getByTestId('location').textContent).toContain('tab=Documents&upload=mandate&uploadProperty=p')
  fireEvent.click(screen.getByRole('button', { name: 'Finish saved mandate upload' }))
  await screen.findByRole('button', { name: 'Create draft listing' })
  expect(api.advance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toStage: 'listing_ready' }))
  await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('tab=Overview'))
})
it('preserves the current stage and action when saving fails', async () => {
  start('appraisal_scheduled')
  api.advance.mockRejectedValueOnce(new Error('Saved journey changed.'))
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as complete' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Mark as complete' }).disabled).toBe(false)
  expect(lead.stage).toBe('appraisal_scheduled')
})
it.each([
  ['appraisal_scheduled', 'appraisal_completed', 'Mark as complete'],
  ['appraisal_completed', 'mandate_pending', 'Mark as sent'],
])('completes %s into %s with the agent’s recorded confirmation', async (stage, target, nextLabel) => {
  start(stage)
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as complete' }))
  await screen.findByRole('button', { name: nextLabel })
  expect(api.advance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toStage: target, evidence: expect.objectContaining({ note: expect.stringContaining('agent') }) }))
})
it.each([
  ['listing_ready', 'Create draft listing', '/agent/rentals/listings/new?leadId=lead&portfolioPropertyId=p'],
  ['listing_created', 'View listing', '/agent/rentals/listings/listing/overview'],
])('opens the saved %s destination without marking a stage complete', async (stage, label, destination) => {
  start(stage, { relationships: { listingId: stage === 'listing_created' ? 'listing' : '' } })
  fireEvent.click(await screen.findByRole('button', { name: label }))
  expect(screen.getByTestId('location').textContent).toBe(destination)
  expect(api.advance).not.toHaveBeenCalled()
})
it('requires an explicit property choice for a multi-property draft listing', async () => {
  start('listing_ready', { raw: { rawEnquiryPayload: { landlordPortfolio: [property, { ...property, id: 'second', title: 'Second home' }] } } })
  const create = await screen.findByRole('button', { name: 'Create draft listing' })
  expect(create.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Portfolio property'), { target: { value: 'second' } })
  fireEvent.click(create)
  expect(screen.getByTestId('location').textContent).toContain('portfolioPropertyId=second')
})
it('opens mandate capture for the chosen property instead of borrowing another property’s signed mandate', async () => {
  start('mandate_pending', { relationships: { propertyId: 'managed', mandateId: 'mandate' }, raw: { rawEnquiryPayload: { landlordPortfolio: [property, { id: 'second', title: 'Second home', canonicalPropertyId: 'other-managed' }] } } })
  await screen.findByRole('button', { name: 'Mark as completed' })
  fireEvent.change(screen.getByLabelText('Portfolio property'), { target: { value: 'second' } })
  fireEvent.click(screen.getByRole('button', { name: 'Mark as completed' }))
  expect(screen.getByTestId('location').textContent).toContain('tab=Portfolio&property=second')
  expect(api.advance).not.toHaveBeenCalled()
})
