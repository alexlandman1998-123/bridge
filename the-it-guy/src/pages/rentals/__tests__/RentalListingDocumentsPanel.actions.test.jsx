// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RentalListingDocumentsPanel from '../RentalListingDocumentsPanel.jsx'
import * as actions from '../../../services/rentals/rentalListingDocumentActions.js'
import * as repository from '../../../services/rentals/rentalApplicationRepository.js'
import { requestRentalLandlordOnboarding } from '../../../services/rentals/rentalLandlordOnboardingService.js'

vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({}) }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ createPersistedRentalApplicantAccess: vi.fn(), listPersistedRentalApplicantAccess: vi.fn(), revokePersistedRentalApplicantAccess: vi.fn() }))
vi.mock('../../../services/rentals/rentalLandlordOnboardingService.js', () => ({ requestRentalLandlordOnboarding: vi.fn() }))
vi.mock('../../../services/rentals/rentalListingDocumentActions.js', async (original) => ({ ...await original(), uploadRentalListingRequirement: vi.fn(), reviewRentalListingDocument: vi.fn(), getRentalListingDocumentUrl: vi.fn(), downloadRentalListingDocument: vi.fn() }))

const evidence = { id: 'file-1', file_name: 'income.pdf', status: 'uploaded' }
const row = { id: 'requirement-1', generation: 1, subjectId: 'primary', purpose: 'proof_of_income', mode: 'active', title: 'Income', source: 'Tenant application', required: true, state: 'received', documents: [evidence] }
function snapshot(kind = 'tenant', status = 'submitted', version = 3) {
  const section = { id: 'parent-1', title: 'Amy', rows: [kind === 'landlord' ? { ...row, purpose: 'property_disclosure' } : row], [kind === 'landlord' ? 'onboarding' : 'application']: { id: 'parent-1', status, version, accessLinks: [], data: { people: [{ id: 'person-2', firstName: 'Bob', lastName: 'Tenant' }] } } }
  return { documents: [], issues: [], documentMatrix: { landlords: kind === 'landlord' ? [section] : [], tenants: kind === 'tenant' ? [section] : [], issues: [] } }
}
function Harness({ initial = snapshot(), refresh }) {
  const [value, setValue] = useState(initial)
  return <RentalListingDocumentsPanel snapshot={value} onRefresh={async () => { const next = await refresh(); setValue(next); return next }} />
}
function tenantTab() { fireEvent.click(screen.getByRole('tab', { name: 'Tenant 1' })) }
beforeEach(() => {
  vi.clearAllMocks()
  repository.listPersistedRentalApplicantAccess.mockResolvedValue([])
  actions.uploadRentalListingRequirement.mockResolvedValue({ savedCount: 2 })
  actions.reviewRentalListingDocument.mockResolvedValue({})
  actions.getRentalListingDocumentUrl.mockResolvedValue('https://local.test/private')
  vi.spyOn(window, 'open').mockImplementation(() => ({ location: {}, close: vi.fn() }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('serializes pack uploads and uses the refreshed parent version for review', async () => {
  let resolveUpload
  actions.uploadRentalListingRequirement.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve }))
  const refresh = vi.fn().mockResolvedValue(snapshot('tenant', 'submitted', 5))
  render(<Harness refresh={refresh} />); tenantTab()
  const files = [new File(['a'], 'one.pdf', { type: 'application/pdf' }), new File(['b'], 'two.pdf', { type: 'application/pdf' })]
  const input = screen.getByLabelText('Upload Income')
  fireEvent.change(input, { target: { files } }); fireEvent.change(input, { target: { files } })
  expect(actions.uploadRentalListingRequirement).toHaveBeenCalledTimes(1)
  expect(actions.uploadRentalListingRequirement.mock.calls[0][3]).toEqual(files)
  resolveUpload({ savedCount: 2 })
  await screen.findByText('2 files uploaded. Current evidence refreshed.')
  fireEvent.change(screen.getByLabelText('Income: income.pdf review note'), { target: { value: 'Checked both months' } })
  fireEvent.click(screen.getByRole('button', { name: 'Accept evidence' }))
  await waitFor(() => expect(actions.reviewRentalListingDocument).toHaveBeenCalledTimes(1))
  expect(actions.reviewRentalListingDocument.mock.calls[0][1].application.version).toBe(5)
  expect(actions.reviewRentalListingDocument.mock.calls[0][3]).toMatchObject({ status: 'accepted', note: 'Checked both months' })
})

it('blocks writes after a saved action cannot refresh, keeps reads available, and restores only on explicit refresh', async () => {
  const refresh = vi.fn().mockRejectedValueOnce(new Error('Read unavailable')).mockResolvedValue(snapshot())
  render(<Harness refresh={refresh} />); tenantTab()
  fireEvent.change(screen.getByLabelText('Upload Income'), { target: { files: [new File(['a'], 'one.pdf')] } })
  await screen.findByText(/Saved successfully, but the matrix could not refresh/)
  expect(screen.getByLabelText('Upload Income').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Open income.pdf' }))
  await waitFor(() => expect(window.open).toHaveBeenCalled())
  expect(screen.getByLabelText('Upload Income').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh matrix' }))
  await waitFor(() => expect(screen.getByLabelText('Upload Income').disabled).toBe(false))
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('requires a note and signed disclosure confirmation and reopens submitted landlord uploads through corrections', async () => {
  const refresh = vi.fn().mockResolvedValue(snapshot('landlord', 'draft', 4))
  requestRentalLandlordOnboarding.mockResolvedValue({})
  render(<Harness initial={snapshot('landlord')} refresh={refresh} />)
  expect(screen.queryByLabelText('Upload Income')).toBeNull()
  fireEvent.change(screen.getByLabelText('Income: income.pdf review note'), { target: { value: 'Disclosure checked' } })
  expect(screen.getByRole('button', { name: 'Accept evidence' }).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText('I checked the prescribed disclosure is completed and signed.'))
  expect(screen.getByRole('button', { name: 'Accept evidence' }).disabled).toBe(false)
  fireEvent.change(screen.getByLabelText('Landlord correction request for Amy'), { target: { value: 'Please correct the signed date' } })
  fireEvent.click(screen.getByRole('button', { name: 'Request corrections' }))
  await waitFor(() => expect(screen.getByLabelText('Upload Income')).toBeTruthy())
  expect(requestRentalLandlordOnboarding).toHaveBeenCalledWith('parent-1', 'POST', { action: 'request_changes', version: 3, patch: { message: 'Please correct the signed date' } })
})

it('creates a person-scoped collection link, copies it and revokes old and newly created links', async () => {
  repository.listPersistedRentalApplicantAccess.mockResolvedValue([{ id: 'old-link', expires_at: '2099-01-01' }, { id: 'expired-link', expires_at: '2000-01-01' }])
  repository.createPersistedRentalApplicantAccess.mockResolvedValue({ id: 'new-link', token: 'secret', expiresAt: '2099-01-01' })
  const refresh = vi.fn().mockResolvedValue(snapshot())
  render(<Harness refresh={refresh} />); tenantTab()
  await screen.findByRole('button', { name: 'Revoke existing link' })
  fireEvent.click(screen.getByRole('button', { name: 'Revoke existing link' }))
  await waitFor(() => expect(repository.revokePersistedRentalApplicantAccess).toHaveBeenCalledWith('old-link'))
  await screen.findByText('Collection link revoked.')
  fireEvent.change(screen.getByLabelText('Link recipient for Amy'), { target: { value: 'person-2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create document collection link' }))
  await screen.findByLabelText('Secure collection link for Amy')
  expect(repository.createPersistedRentalApplicantAccess).toHaveBeenCalledWith('parent-1', expect.objectContaining({ subjectId: 'person-2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy collection link' }))
  await screen.findByText('Link copied.')
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/rental-application/secret'))
  fireEvent.click(screen.getByRole('button', { name: 'Revoke this link' }))
  await waitFor(() => expect(repository.revokePersistedRentalApplicantAccess).toHaveBeenCalledWith('new-link'))
})

it('provides private downloads but prevents uploads, review and link creation on final applications', async () => {
  render(<Harness initial={snapshot('tenant', 'approved')} refresh={vi.fn()} />); tenantTab()
  expect(screen.queryByLabelText('Upload Income')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Accept evidence' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Create document collection link' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Download income.pdf' }))
  await waitFor(() => expect(actions.downloadRentalListingDocument).toHaveBeenCalledWith('https://local.test/private', 'income.pdf'))
})

it('opens the preview during the click and closes it when private URL retrieval fails', async () => {
  let rejectUrl
  actions.getRentalListingDocumentUrl.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectUrl = reject }))
  const preview = { location: {}, close: vi.fn(), opener: window }
  window.open.mockReturnValueOnce(preview)
  render(<Harness refresh={vi.fn()} />); tenantTab()
  fireEvent.click(screen.getByRole('button', { name: 'Open income.pdf' }))
  expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
  expect(preview.opener).toBeNull()
  rejectUrl(new Error('Private URL unavailable'))
  await screen.findByText('Private URL unavailable')
  expect(preview.close).toHaveBeenCalledOnce()
})
