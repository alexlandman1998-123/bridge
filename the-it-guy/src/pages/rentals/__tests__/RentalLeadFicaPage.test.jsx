// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const api = vi.hoisted(() => ({ workspace: {}, list: vi.fn(), save: vi.fn(), advance: vi.fn(), complete: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => api.workspace }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ listRentalLeads: api.list, advanceRentalLead: api.advance }))
vi.mock('../../../services/rentals/rentalLeadFicaService', () => ({
  saveRentalLeadFicaChecklist: api.save, completeRentalLeadFica: api.complete,
  getRentalLeadFicaChecklist: lead => lead.raw?.rawEnquiryPayload?.compliance?.fica?.checklist || {},
}))
import RentalLeadFicaPage from '../RentalLeadFicaPage'
const row = (id, stage = 'screening_pending') => ({ id, name: `Tenant ${id}`, role: 'tenant', stage, updatedAt: 'v1', raw: { leadId: id, rawEnquiryPayload: {} } })
beforeEach(() => {
  vi.clearAllMocks()
  api.workspace = { currentWorkspace: { id: 'org' }, profile: { id: 'manager' }, workspaceRole: 'principal' }
  api.list.mockResolvedValue([row('a'), row('b')])
  api.save.mockImplementation(async (lead, checklist) => ({ updated: { updatedAt: 'v2', rawEnquiryPayload: { compliance: { fica: { checklist } } } } }))
  api.advance.mockImplementation(async lead => ({ ...lead, stage: 'fica_pending' }))
})
afterEach(cleanup)
it('passes manager scope, retains the saved checklist after switching leads and uses its new revision', async () => {
  render(<RentalLeadFicaPage />)
  await screen.findByText('Tenant a · Screening Pending')
  fireEvent.change(screen.getByLabelText('Identity'), { target: { value: 'verified' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByLabelText('Tenant lead').disabled).toBe(false))
  expect(api.save.mock.calls[0][2].scope).toMatchObject({ scopeLevel: 'organisation', includeAllOrganisationLeads: true })
  fireEvent.change(screen.getByLabelText('Tenant lead'), { target: { value: 'b' } })
  fireEvent.change(screen.getByLabelText('Tenant lead'), { target: { value: 'a' } })
  expect(screen.getByLabelText('Identity').value).toBe('verified')
  fireEvent.click(screen.getByRole('button', { name: 'Start FICA' }))
  await waitFor(() => expect(api.advance).toHaveBeenCalledTimes(1))
  expect(api.advance.mock.calls[0][0].updatedAt).toBe('v2')
  expect(api.advance.mock.calls[0][1].scope.includeAllOrganisationLeads).toBe(true)
})
it('does not restore an earlier organisation after a delayed read completes', async () => {
  let finishOld
  api.list.mockImplementation(org => org === 'org' ? new Promise(resolve => { finishOld = resolve }) : Promise.resolve([row('new')]))
  const view = render(<RentalLeadFicaPage />)
  api.workspace = { ...api.workspace, currentWorkspace: { id: 'new-org' } }
  view.rerender(<RentalLeadFicaPage />)
  await screen.findByText('Tenant new · Screening Pending')
  await act(async () => { finishOld([row('old')]) })
  expect(screen.queryByText('Tenant old · Screening Pending')).toBeNull()
  expect(screen.getByText('Tenant new · Screening Pending')).toBeTruthy()
})
it('selects the remaining tenant after successful completion', async () => {
  api.list.mockResolvedValue([row('a', 'fica_pending'), row('b', 'fica_pending')])
  api.complete.mockResolvedValue({ id: 'a', stage: 'fica_complete' })
  render(<RentalLeadFicaPage />)
  await screen.findByText('Tenant a · Fica Pending')
  fireEvent.click(screen.getByRole('button', { name: 'Mark FICA complete' }))
  await waitFor(() => expect(screen.getByLabelText('Tenant lead').value).toBe('b'))
  expect(api.complete.mock.calls[0][3].scope.includeAllOrganisationLeads).toBe(true)
})
