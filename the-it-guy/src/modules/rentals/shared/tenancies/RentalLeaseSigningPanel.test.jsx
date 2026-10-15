// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import RentalLeaseSigningPanel from './RentalLeaseSigningPanel.jsx'
import * as repository from '../../../../services/rentals/rentalLeaseSigningRepository.js'
import * as uploads from '../../../../services/rentals/rentalLeaseDocumentUploadService.js'
import {rentalLeaseScheduleSigners} from '../../../../services/rentals/rentalLeaseSchedule.js'
vi.mock('../../../../services/rentals/rentalLeaseSigningRepository.js',()=>({getRentalLeaseSigningWorkspace:vi.fn(),saveRentalLeaseDraft:vi.fn(),prepareRentalLeaseSigning:vi.fn()}))
vi.mock('../../../../services/rentals/rentalLeaseDocumentUploadService.js',()=>({getRentalLeaseDocumentUrl:vi.fn(),uploadRentalLeaseDocument:vi.fn()}))
const projection={tenant:{name:'Tenant Company',type:'company'},property:{title:'First home',address:'12 Road'},tenantNoticeAddress:'Tenant notice',landlord:{name:'Lessor',email:'lessor@example.test',noticeAddress:'Lessor notice'},parties:[{subjectId:'primary',role:'tenant_representative',name:'First Person',email:'first@example.test',identityType:'passport',identityNumber:'A123',noticeAddress:'Tenant notice',authorityBasis:'Resolution'},{subjectId:'second',role:'guarantor',name:'Second Person',email:'second@example.test',identityNumber:'B123',noticeAddress:'Other address'}]}
const agreement={id:'agreement',kind:'agreement',file_name:'reviewed.pdf',lease_version_id:'version'}
const workspace=()=>({lease:{id:'lease',status:'draft'},version:{id:'version',organisation_id:'org',version_number:2,effective_start_date:'2026-11-01',effective_end_date:'2027-10-31',occupation_date:'2026-11-01',monthly_rent:11000,deposit_amount:22000,terms_json:{application_schedule:projection,agreement_upload_id:'agreement',landlord_name:'Lessor',primary_authority_basis:'Resolution'}},projection,signers:[],uploads:[agreement]})
beforeEach(()=>{vi.resetAllMocks();repository.getRentalLeaseSigningWorkspace.mockResolvedValue(workspace());repository.saveRentalLeaseDraft.mockResolvedValue({});repository.prepareRentalLeaseSigning.mockResolvedValue({})})
afterEach(cleanup)
it('reviews every tenant-side role and the actual upload before preparing this saved version',async()=>{
 render(<RentalLeaseSigningPanel tenancyId="tenancy"/>);await screen.findByText('Tenant representative · First Person')
 expect(screen.getByText('Guarantor · Second Person')).toBeTruthy();expect(screen.queryByRole('button',{name:'Download lease schedule'})).toBeNull();expect(screen.queryByLabelText('Reviewed agreement document link')).toBeNull()
 expect(screen.getByRole('button',{name:'Prepare signing'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Prepare signing'}))
 await waitFor(()=>expect(repository.prepareRentalLeaseSigning).toHaveBeenCalledWith({leaseId:'lease',expectedVersion:2,signers:rentalLeaseScheduleSigners(projection,2)}))
})
it('requires another agreement upload after changed terms create a new version',async()=>{
 render(<RentalLeaseSigningPanel tenancyId="tenancy"/>);await screen.findByText('Tenant representative · First Person')
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.change(screen.getByLabelText('Tenant notice address'),{target:{value:'Updated address'}})
 expect(screen.getByRole('checkbox').checked).toBe(false);expect(screen.getByRole('checkbox').disabled).toBe(true)
 const next=workspace();next.version.version_number=3;next.version.id='new-version';delete next.version.terms_json.agreement_upload_id;next.uploads=[]
 repository.getRentalLeaseSigningWorkspace.mockResolvedValue(next);fireEvent.click(screen.getByRole('button',{name:'Save lease draft'}))
 await waitFor(()=>expect(repository.saveRentalLeaseDraft).toHaveBeenCalledWith(expect.objectContaining({expectedVersion:2,terms:expect.objectContaining({tenant_notice_address:'Updated address',monthly_rent:11000})})))
 await screen.findByText('Upload the agreement before preparing signing.');expect(screen.getByRole('checkbox').disabled).toBe(true)
 expect(screen.getByLabelText('Upload reviewed agreement').disabled).toBe(false)
})
it('keeps a signed-file receipt for retry and records the correct person without re-uploading',async()=>{
 const next=workspace();next.lease.status='awaiting_tenant';next.signers=[{id:'a',signer_role:'tenant_representative',signer_name:'First Person',status:'signed'},{id:'b',signer_role:'guarantor',signer_name:'Second Person',status:'pending'},{id:'c',signer_role:'landlord',signer_name:'Lessor',status:'signed'}]
 repository.getRentalLeaseSigningWorkspace.mockResolvedValue(next)
 const receipt={id:'file',signerId:'b'},error=new Error('Lease link save failed');error.uploadReceipt=receipt;uploads.uploadRentalLeaseDocument.mockRejectedValueOnce(error)
 render(<RentalLeaseSigningPanel tenancyId="tenancy"/>);await screen.findByText('Landlord · Lessor')
 const file=new File(['signed'],'signed.pdf',{type:'application/pdf'});fireEvent.change(screen.getByLabelText('Signed agreement for Second Person'),{target:{files:[file]}})
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Upload and record signature'}));await screen.findByText('The signed file uploaded. Retry saving its lease connection.')
 expect(screen.getByLabelText('Signed agreement for Second Person').disabled).toBe(true)
 uploads.uploadRentalLeaseDocument.mockResolvedValueOnce({id:'file',signer_id:'b',kind:'signed_agreement',file_name:'signed.pdf',leaseStatus:'signed'})
 next.lease.status='signed';next.signers[1].status='signed';next.uploads.push({id:'file',kind:'signed_agreement',signer_id:'b',file_name:'signed.pdf'})
 fireEvent.click(screen.getByRole('button',{name:'Retry signed agreement link'}))
 await waitFor(()=>expect(uploads.uploadRentalLeaseDocument).toHaveBeenLastCalledWith(expect.objectContaining({receipt,signerId:'b',kind:'signed_agreement',confirmSigned:true})))
 await screen.findByRole('button',{name:'Open signed copy: signed.pdf'})
})
it('keeps the confirmed upload when refreshing its lease fails after the save',async()=>{
 const next=workspace();next.uploads=[];delete next.version.terms_json.agreement_upload_id;repository.getRentalLeaseSigningWorkspace.mockResolvedValueOnce(next).mockRejectedValueOnce(new Error('Local refresh failed'))
 uploads.uploadRentalLeaseDocument.mockResolvedValue({id:'new-upload',kind:'agreement',file_name:'saved.pdf',leaseStatus:'draft'})
 render(<RentalLeaseSigningPanel tenancyId="tenancy"/>);await screen.findByText('Tenant representative · First Person')
 fireEvent.change(screen.getByLabelText('Upload reviewed agreement'),{target:{files:[new File(['file'],'saved.pdf',{type:'application/pdf'})]}});fireEvent.click(screen.getByRole('button',{name:'Upload agreement'}))
 await screen.findByText('Saved successfully. Refresh the lease details: Local refresh failed')
 expect(screen.getByRole('button',{name:'Open uploaded agreement: saved.pdf'})).toBeTruthy();expect(screen.getByRole('button',{name:'Upload agreement'}).disabled).toBe(true)
})
it('does not carry an old tenancy’s file or loading response into a different tenancy',async()=>{
 let resolve;repository.getRentalLeaseSigningWorkspace.mockImplementationOnce(()=>new Promise(done=>{resolve=done})).mockResolvedValueOnce({...workspace(),projection:{...projection,tenant:{name:'Second tenancy',type:'company'}}})
 const view=render(<RentalLeaseSigningPanel tenancyId="first"/>);view.rerender(<RentalLeaseSigningPanel tenancyId="second"/>);await screen.findByText('Second tenancy · Company')
 resolve(workspace());await waitFor(()=>expect(screen.queryByText('Tenant Company · Company')).toBeNull())
})
