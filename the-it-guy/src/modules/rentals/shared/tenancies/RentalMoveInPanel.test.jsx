// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import RentalMoveInPanel from './RentalMoveInPanel.jsx'
import * as repository from '../../../../services/rentals/rentalTenancyMoveInRepository.js'
import {getRentalLeaseSigningWorkspace} from '../../../../services/rentals/rentalLeaseSigningRepository.js'
import {uploadRentalLeaseDocument} from '../../../../services/rentals/rentalLeaseDocumentUploadService.js'
vi.mock('./RentalIncomingInspectionPanel.jsx',()=>({default:()=>null}))
vi.mock('../../../../services/rentals/rentalTenancyMoveInRepository.js',()=>({getRentalTenancyMoveInWorkspace:vi.fn(),recordRentalMoveInReadiness:vi.fn(),startRentalIncomingInspection:vi.fn(),activateRentalTenancy:vi.fn()}))
vi.mock('../../../../services/rentals/rentalLeaseSigningRepository.js',()=>({getRentalLeaseSigningWorkspace:vi.fn()}))
vi.mock('../../../../services/rentals/rentalLeaseDocumentUploadService.js',()=>({uploadRentalLeaseDocument:vi.fn()}))
let workspace
beforeEach(()=>{vi.resetAllMocks();workspace={lease:{status:'signed'},move_in_readiness:{ready:false},readinessItems:[{id:'deposit',obligation_type:'deposit',required_amount:22000,received_amount:0,status:'required'}]};repository.getRentalTenancyMoveInWorkspace.mockResolvedValue(workspace);getRentalLeaseSigningWorkspace.mockResolvedValue({lease:{id:'lease'},version:{id:'version'}})})
afterEach(cleanup)
it('requires a real payment upload before recording verified readiness',async()=>{
 uploadRentalLeaseDocument.mockResolvedValue({id:'proof',storage_bucket:'rental-lease-files',storage_path:'saved/proof.pdf'});repository.recordRentalMoveInReadiness.mockResolvedValue({})
 render(<RentalMoveInPanel tenancyId="tenancy" tenancyStatus="draft"/>);await screen.findByLabelText('Deposit received amount')
 expect(screen.getByRole('button',{name:'Verify evidence'}).disabled).toBe(true);expect(screen.queryByPlaceholderText('Evidence link or receipt reference')).toBeNull()
 fireEvent.change(screen.getByLabelText('Deposit received amount'),{target:{value:'22000'}});fireEvent.change(screen.getByLabelText('Upload Deposit payment evidence'),{target:{files:[new File(['proof'],'proof.pdf',{type:'application/pdf'})]}})
 fireEvent.click(screen.getByRole('button',{name:'Verify evidence'}));await waitFor(()=>expect(repository.recordRentalMoveInReadiness).toHaveBeenCalledWith({readinessItemId:'deposit',status:'verified',receivedAmount:'22000',evidenceLink:'rental-lease-files/saved/proof.pdf'}))
 expect(screen.getByRole('button',{name:'Activate tenancy'}).disabled).toBe(true)
})
it('keeps uploaded payment proof when its readiness write fails, and retries without another upload',async()=>{
 uploadRentalLeaseDocument.mockResolvedValue({id:'proof',storage_bucket:'rental-lease-files',storage_path:'saved/proof.pdf'});repository.recordRentalMoveInReadiness.mockRejectedValueOnce(new Error('Local readiness save failed')).mockResolvedValueOnce({})
 render(<RentalMoveInPanel tenancyId="tenancy" tenancyStatus="draft"/>);await screen.findByLabelText('Upload Deposit payment evidence')
 fireEvent.change(screen.getByLabelText('Deposit received amount'),{target:{value:'22000'}});fireEvent.change(screen.getByLabelText('Upload Deposit payment evidence'),{target:{files:[new File(['proof'],'proof.pdf',{type:'application/pdf'})]}});fireEvent.click(screen.getByRole('button',{name:'Verify evidence'}))
 await screen.findByText('Payment proof saved. Retry its readiness connection.')
 workspace.readinessItems[0].status='verified';fireEvent.click(screen.getByRole('button',{name:'Retry payment evidence'}));await screen.findByText('Complete')
 expect(uploadRentalLeaseDocument).toHaveBeenCalledTimes(1);expect(repository.recordRentalMoveInReadiness).toHaveBeenCalledTimes(2)
})

it('shows completed activation without inventing a missing signature for an active lease',async()=>{
 workspace.lease.status='active';workspace.move_in_readiness.ready=true;workspace.incoming_inspection={id:'inspection',status:'completed'};workspace.readinessItems[0].status='verified'
 render(<RentalMoveInPanel tenancyId="tenancy" tenancyStatus="active"/>);await screen.findByText('Active tenancy')
 expect(screen.queryByText('Fully signed lease')).toBeNull();expect(screen.getByRole('button',{name:'Tenancy active'}).disabled).toBe(true)
})
