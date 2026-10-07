// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RentalLeaseSigningPanel from './RentalLeaseSigningPanel.jsx'
import * as repository from '../../../../services/rentals/rentalLeaseSigningRepository.js'
import * as schedules from '../../../../services/rentals/rentalLeaseSchedule.js'
vi.mock('../../../../services/rentals/rentalLeaseSigningRepository.js', () => ({ getRentalLeaseSigningWorkspace: vi.fn(), saveRentalLeaseDraft: vi.fn(), prepareRentalLeaseSigning: vi.fn(), recordRentalLeaseSignature: vi.fn() }))
vi.mock('../../../../services/rentals/rentalLeaseSchedule.js', async (original) => ({ ...await original(), downloadRentalLeaseSchedule: vi.fn() }))
const projection = { tenant: { name: 'Tenant Company', type: 'company' }, property: { title: 'First home', address: '12 Road' }, tenantNoticeAddress: 'Tenant notice', landlord: { name: 'Lessor', email: 'lessor@example.test', noticeAddress: 'Lessor notice' }, parties: [{ subjectId: 'primary', role: 'tenant_representative', name: 'First Person', email: 'first@example.test', identityType: 'passport', identityNumber: 'A123', noticeAddress: 'Tenant notice', authorityBasis: 'Resolution' }, { subjectId: 'second', role: 'guarantor', name: 'Second Person', email: 'second@example.test', identityNumber: 'B123', noticeAddress: 'Other address' }] }
const workspace = () => ({ lease: { id: 'lease', status: 'draft' }, version: { version_number: 2, effective_start_date: '2026-11-01', effective_end_date: '2027-10-31', occupation_date: '2026-11-01', monthly_rent: 11000, deposit_amount: 22000, terms_json: { application_schedule: projection, landlord_name: 'Lessor', primary_authority_basis: 'Resolution' } }, projection, signers: [] })
beforeEach(() => { vi.clearAllMocks(); repository.getRentalLeaseSigningWorkspace.mockResolvedValue(workspace()); repository.saveRentalLeaseDraft.mockResolvedValue({}); repository.prepareRentalLeaseSigning.mockResolvedValue({}) })
afterEach(cleanup)
it('shows every tenant-side role and prepares exactly the reviewed saved version', async () => {
 render(<RentalLeaseSigningPanel tenancyId="tenancy" />)
 await screen.findByText('Tenant representative · First Person')
 expect(screen.getByText('Guarantor · Second Person')).toBeTruthy()
 const prepare = screen.getByRole('button', { name: 'Prepare signing' })
 expect(prepare.disabled).toBe(true)
 fireEvent.click(screen.getByRole('button', { name: 'Download lease schedule' }))
 expect(schedules.downloadRentalLeaseSchedule).toHaveBeenCalledWith(projection, 2)
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.click(prepare)
 await waitFor(() => expect(repository.prepareRentalLeaseSigning).toHaveBeenCalledWith({ leaseId: 'lease', expectedVersion: 2, signers: schedules.rentalLeaseScheduleSigners(projection, 2) }))
})
it('editing invalidates review and saves a new version before preparing signatures', async () => {
 render(<RentalLeaseSigningPanel tenancyId="tenancy" />)
 await screen.findByText('Tenant representative · First Person')
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.change(screen.getByLabelText('Tenant notice address'), { target: { value: 'Updated address' } })
 expect(screen.getByRole('checkbox').checked).toBe(false)
 expect(screen.getByRole('checkbox').disabled).toBe(true)
 expect(screen.getByRole('button', { name: 'Prepare signing' }).disabled).toBe(true)
 const next = workspace(); next.version.version_number = 3
 repository.getRentalLeaseSigningWorkspace.mockResolvedValue(next)
 fireEvent.click(screen.getByRole('button', { name: 'Save lease draft' }))
 await waitFor(() => expect(repository.saveRentalLeaseDraft).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 2, terms: expect.objectContaining({ tenant_notice_address: 'Updated address', monthly_rent: 11000 }) })))
 await waitFor(() => expect(screen.getByRole('checkbox').disabled).toBe(false))
 expect(screen.getByRole('checkbox').checked).toBe(false)
})
it('retains all signers while recording evidence and shows protected-command errors', async () => {
 const next = workspace(); next.lease.status = 'awaiting_tenant'; next.signers = [{ id: 'a', signer_role: 'tenant_representative', signer_name: 'First Person', status: 'signed' }, { id: 'b', signer_role: 'guarantor', signer_name: 'Second Person', status: 'pending' }, { id: 'c', signer_role: 'landlord', signer_name: 'Lessor', status: 'signed' }]
 repository.getRentalLeaseSigningWorkspace.mockResolvedValue(next)
 repository.recordRentalLeaseSignature.mockRejectedValue(new Error('This signature belongs to an old lease version'))
 render(<RentalLeaseSigningPanel tenancyId="tenancy" />)
 await screen.findByText('Landlord · Lessor')
 fireEvent.change(screen.getByLabelText('Signed document link'), { target: { value: 'https://example.test/signed.pdf' } })
 fireEvent.click(screen.getByRole('button', { name: 'Record signature' }))
 await screen.findByText('This signature belongs to an old lease version')
 expect(repository.recordRentalLeaseSignature).toHaveBeenCalledWith({ signerId: 'b', documentLink: 'https://example.test/signed.pdf' })
})
