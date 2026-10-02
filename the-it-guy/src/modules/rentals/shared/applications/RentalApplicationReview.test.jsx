// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalApplicationDocumentReviewPanel from './RentalApplicationDocumentReviewPanel.jsx'
import RentalApplicationReviewActions from './RentalApplicationReviewActions.jsx'
import RentalApplicationScreeningPanel from './RentalApplicationScreeningPanel.jsx'
import RentalApplicationTenancyConversionPanel from './RentalApplicationTenancyConversionPanel.jsx'
import { recordRentalApplicationReview, listRentalApplicationScreeningChecks, getRentalApplicationTenancyConversion, convertRentalApplicationToTenancy } from '../../../../services/rentals/rentalApplicationRepository.js'
vi.mock('../../../../services/rentals/rentalApplicationRepository.js', () => ({ recordRentalApplicationReview: vi.fn(), getRentalApplicationDocumentUrl: vi.fn(), listRentalApplicationScreeningChecks: vi.fn(), getRentalApplicationTenancyConversion: vi.fn(), convertRentalApplicationToTenancy: vi.fn() }))
const application = { id:'app', status:'submitted', version:7, data:{ identity:{firstName:'Alex'},people:[{id:'g-1',role:'guarantor',firstName:'Sam'}] },documents:[{id:'doc',type:'identity',name:'id.pdf',status:'uploaded'}] }
afterEach(() => { cleanup(); vi.clearAllMocks() })
beforeEach(() => { recordRentalApplicationReview.mockResolvedValue({version:8}); listRentalApplicationScreeningChecks.mockResolvedValue([]); vi.spyOn(window,'confirm').mockReturnValue(true) })
it('requires evidence notes and sends the exact document and expected version for acceptance', async () => {
  const onSaved = vi.fn().mockResolvedValue()
  render(<RentalApplicationDocumentReviewPanel application={application} onSaved={onSaved} />)
  expect(screen.getByRole('button',{name:'Accept'}).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Primary applicant identity review note'),{target:{value:'Identity original checked'}})
  fireEvent.click(screen.getByRole('button',{name:'Accept'}))
  await waitFor(() => expect(recordRentalApplicationReview).toHaveBeenCalledWith({applicationId:'app',expectedVersion:7,command:'review_document',payload:{documentId:'doc',status:'accepted',note:'Identity original checked'}}))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
})
it('retains document notes on a stale-version failure instead of losing the review', async () => {
  recordRentalApplicationReview.mockRejectedValue(new Error('Application changed. Refresh.'))
  render(<RentalApplicationDocumentReviewPanel application={application} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Primary applicant identity review note'),{target:{value:'Reviewed original'}})
  fireEvent.click(screen.getByRole('button',{name:'Accept'}))
  await screen.findByText('Application changed. Refresh.')
  expect(screen.getByLabelText('Primary applicant identity review note').value).toBe('Reviewed original')
})
it('records corrections separately from confidential landlord notes and waits for refresh', async () => {
  const onSaved = vi.fn().mockResolvedValue()
  render(<RentalApplicationReviewActions application={application} onSaved={onSaved} />)
  fireEvent.change(screen.getByText('Corrections to share with the applicant').closest('label').querySelector('textarea'),{target:{value:'Please update the move-in date.'}})
  fireEvent.click(screen.getByRole('button',{name:'Request corrections'}))
  await waitFor(() => expect(recordRentalApplicationReview).toHaveBeenCalledWith({applicationId:'app',expectedVersion:7,command:'request_changes',payload:{message:'Please update the move-in date.'}}))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
})
it('screens the selected guarantor and prevents screening a draft application', async () => {
  const { rerender } = render(<RentalApplicationScreeningPanel application={application} onSaved={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('Person / entity').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Person / entity'),{target:{value:'g-1'}})
  fireEvent.change(screen.getByLabelText('Reviewer outcome'),{target:{value:'passed'}})
  fireEvent.change(screen.getByLabelText('Evidence / reviewer note'),{target:{value:'Guarantor ID checked'}})
  fireEvent.click(screen.getByRole('button',{name:'Save screening check'}))
  await waitFor(() => expect(recordRentalApplicationReview).toHaveBeenCalledWith(expect.objectContaining({expectedVersion:7,payload:expect.objectContaining({subjectId:'g-1',status:'passed'})})))
  rerender(<RentalApplicationScreeningPanel application={{...application,status:'draft'}} onSaved={vi.fn()} />)
  expect(screen.getByLabelText('Person / entity').matches(':disabled')).toBe(true)
})
it('opens an existing lease instead of creating a second tenancy and renders array-shaped lease relations', async () => {
  getRentalApplicationTenancyConversion.mockResolvedValue({id:'tenancy',rental_leases:[{status:'awaiting_tenant'}]})
  render(<MemoryRouter><RentalApplicationTenancyConversionPanel application={{...application,status:'approved'}} /></MemoryRouter>)
  await screen.findByRole('link',{name:/Open tenancy workspace/})
  expect(screen.getByText(/awaiting_tenant/)).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Create tenancy draft'})).toBeNull()
  expect(convertRentalApplicationToTenancy).not.toHaveBeenCalled()
})
