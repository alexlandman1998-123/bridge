// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import RentalIncomingInspectionPanel from './RentalIncomingInspectionPanel.jsx'
import * as repository from '../../../../services/rentals/rentalTenancyMoveInRepository.js'
import {getRentalLeaseSigningWorkspace} from '../../../../services/rentals/rentalLeaseSigningRepository.js'
import {uploadRentalLeaseDocument} from '../../../../services/rentals/rentalLeaseDocumentUploadService.js'
vi.mock('../../../../services/rentals/rentalTenancyMoveInRepository.js',()=>({getRentalIncomingInspection:vi.fn(),startRentalIncomingInspection:vi.fn(),recordRentalIncomingInspectionItem:vi.fn(),linkRentalIncomingInspectionPhoto:vi.fn(),completeRentalIncomingInspection:vi.fn()}))
vi.mock('../../../../services/rentals/rentalLeaseSigningRepository.js',()=>({getRentalLeaseSigningWorkspace:vi.fn()}))
vi.mock('../../../../services/rentals/rentalLeaseDocumentUploadService.js',()=>({uploadRentalLeaseDocument:vi.fn(),getRentalLeaseDocumentUrl:vi.fn()}))
let inspection
beforeEach(()=>{vi.resetAllMocks();inspection={id:'inspection',status:'in_progress',items:[{id:'report',item_key:'condition_report',status:'required'},{id:'photo',item_key:'photo_evidence',status:'required'}],media:[]};repository.getRentalIncomingInspection.mockResolvedValue(inspection);getRentalLeaseSigningWorkspace.mockResolvedValue({lease:{id:'lease',status:'signed'},version:{id:'version'},projection:{parties:[{subjectId:'primary',name:'Saved Tenant'}]},uploads:[]})})
afterEach(cleanup)
it('retains an uploaded report when checklist recording fails and retries its exact connection',async()=>{
 const uploaded={id:'upload',storage_bucket:'rental-lease-files',storage_path:'saved/report.pdf'};uploadRentalLeaseDocument.mockResolvedValue(uploaded);repository.recordRentalIncomingInspectionItem.mockRejectedValueOnce(new Error('Local checklist save failed')).mockResolvedValueOnce({})
 render(<RentalIncomingInspectionPanel tenancyId="tenancy"/>);await screen.findByText('Condition Report · Required')
 const report=screen.getByText('Condition Report · Required').closest('article');fireEvent.change(within(report).getByLabelText('Upload Condition Report'),{target:{files:[new File(['report'],'report.pdf',{type:'application/pdf'})]}});fireEvent.click(within(report).getByRole('button',{name:'Upload and verify evidence'}))
 await screen.findByText('Local checklist save failed');expect(within(report).getByLabelText('Upload Condition Report').disabled).toBe(true)
 inspection.items[0].status='completed';fireEvent.click(within(report).getByRole('button',{name:'Retry evidence connection'}));await screen.findByText('Condition Report · Completed')
 expect(uploadRentalLeaseDocument).toHaveBeenCalledTimes(1);expect(repository.recordRentalIncomingInspectionItem).toHaveBeenLastCalledWith('report','rental-lease-files/saved/report.pdf','Uploaded evidence checked')
 expect(screen.getByRole('button',{name:'Complete incoming handover'}).disabled).toBe(true)
})
it('requires uploaded checklist evidence and a condition photo before completing the acknowledgement',async()=>{
 render(<RentalIncomingInspectionPanel tenancyId="tenancy"/>);await screen.findByText('Photo Evidence · Required');expect(screen.getByRole('button',{name:'Complete incoming handover'}).disabled).toBe(true)
 const photo=screen.getByText('Photo Evidence · Required').closest('article');fireEvent.change(within(photo).getByLabelText('Upload Photo Evidence'),{target:{files:[new File(['photo'],'condition.jpg',{type:'image/jpeg'})]}})
 uploadRentalLeaseDocument.mockResolvedValue({id:'photo',storage_bucket:'rental-lease-files',storage_path:'saved/condition.jpg'});repository.linkRentalIncomingInspectionPhoto.mockResolvedValue({});repository.recordRentalIncomingInspectionItem.mockResolvedValue({})
 inspection.items.forEach(item=>{item.status='completed'});inspection.media=[{id:'photo'}]
 fireEvent.click(within(photo).getByRole('button',{name:'Upload and verify evidence'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Complete incoming handover'}).disabled).toBe(false))
 fireEvent.click(screen.getByRole('button',{name:'Complete incoming handover'}));await waitFor(()=>expect(repository.completeRentalIncomingInspection).toHaveBeenCalledWith('inspection','Saved Tenant',''))
 expect(repository.linkRentalIncomingInspectionPhoto).toHaveBeenCalledWith('inspection','rental-lease-files/saved/condition.jpg','Incoming condition')
})
