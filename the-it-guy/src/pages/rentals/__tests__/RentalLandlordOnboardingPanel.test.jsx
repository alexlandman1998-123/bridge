// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import Panel from '../../../modules/rentals/shared/applications/RentalLandlordOnboardingPanel.jsx'
const mocks=vi.hoisted(() => ({request:vi.fn(),upload:vi.fn()}))
vi.mock('../../../services/rentals/rentalLandlordOnboardingService.js',() => ({requestRentalLandlordOnboarding:mocks.request}))
vi.mock('../../../services/rentals/rentalApplicationFileUpload.js',() => ({uploadRentalApplicationFile:mocks.upload}))
const onboarding={id:'lead',version:4,status:'draft',data:{profile:{name:'Owner'},portfolio:[]},requirements:[{id:'req',subjectId:'primary',scopeKey:'identity',purpose:'identity',generation:2,active:true,state:'missing'}],documents:[],accessLinks:[{id:'old-link',expiresAt:'2099-01-01',revokedAt:null}]}
beforeEach(() => {vi.clearAllMocks();mocks.request.mockResolvedValue({onboarding})})
afterEach(cleanup)
it('can revoke an existing link after the workspace is reopened',async () => {
 render(<Panel leadId='lead' revision='saved'/>);await screen.findByRole('button',{name:'Revoke existing link'})
 fireEvent.click(screen.getByRole('button',{name:'Revoke existing link'}))
 await screen.findByText('Onboarding link revoked.')
 expect(mocks.request).toHaveBeenCalledWith('lead','POST',{action:'revoke_access',accessId:'old-link'})
})
it('uploads through the same saved requirement and version as the landlord journey',async () => {
 const file=new File(['ID'],'ID.pdf',{type:'application/pdf'})
 mocks.upload.mockResolvedValue({onboarding:{...onboarding,version:5}})
 const {rerender}=render(<Panel leadId='lead' revision='saved' discoveryDirty/>);await screen.findByRole('button',{name:'Upload / Request document'});fireEvent.click(screen.getByRole('button',{name:'Upload / Request document'}));fireEvent.change(screen.getByLabelText('Document requirement'),{target:{value:'req'}})
 expect(screen.getByLabelText('Upload Owner: Identity evidence').disabled).toBe(true)
 rerender(<Panel leadId='lead' revision='saved'/>);
 fireEvent.change(screen.getByLabelText('Upload Owner: Identity evidence'),{target:{files:[file]}})
 await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce())
 expect(mocks.upload.mock.calls[0].slice(0,3)).toEqual([file,{requirementId:'req',generation:2,subjectId:'primary',purpose:'identity'},4])
 expect(await screen.findByText('ID.pdf uploaded.')).toBeTruthy()
})
it('opens the requested mandate uploader and continues only after its saved document is returned', async () => {
 const requirement={id:'mandate-req',subjectId:'p',scopeKey:'property',purpose:'signed_mandate',generation:3,active:true,state:'missing'}
 const saved={...onboarding,data:{profile:{name:'Owner'},portfolio:[{id:'p',title:'First home'}]},requirements:[requirement],documents:[]}
 mocks.request.mockResolvedValue({onboarding:saved})
 mocks.upload.mockResolvedValue({onboarding:{...saved,version:5,requirements:[{...requirement,documentId:'mandate-doc'}],documents:[{id:'mandate-doc',file_name:'mandate.pdf'}]}})
 const onMandateUploaded=vi.fn()
 render(<Panel leadId="lead" revision="saved" initialUploadPurpose="signed_mandate" initialUploadSubject="p" onMandateUploaded={onMandateUploaded}/>);
 const select=await screen.findByLabelText('Document requirement')
 expect(select.value).toBe('mandate-req')
 fireEvent.change(screen.getByLabelText(/Upload .*mandate/i),{target:{files:[new File(['signed'],'mandate.pdf',{type:'application/pdf'})]}})
 await waitFor(()=>expect(onMandateUploaded).toHaveBeenCalledWith(expect.objectContaining({id:'mandate-req',subjectId:'p',purpose:'signed_mandate'})))
})
it('does not complete the mandate step when the upload receipt lacks the saved document', async () => {
 const requirement={id:'mandate-req',subjectId:'p',scopeKey:'property',purpose:'signed_mandate',generation:3,active:true,state:'missing'}
 const saved={...onboarding,data:{profile:{name:'Owner'},portfolio:[{id:'p',title:'First home'}]},requirements:[requirement],documents:[]}
 mocks.request.mockResolvedValue({onboarding:saved})
 mocks.upload.mockResolvedValue({onboarding:{...saved,version:5}})
 const onMandateUploaded=vi.fn()
 render(<Panel leadId="lead" revision="saved" initialUploadPurpose="signed_mandate" onMandateUploaded={onMandateUploaded}/>);
 await screen.findByLabelText('Document requirement')
 fireEvent.change(screen.getByLabelText(/Upload .*mandate/i),{target:{files:[new File(['signed'],'mandate.pdf',{type:'application/pdf'})]}})
 expect((await screen.findAllByText('The saved mandate upload could not be verified. Refresh Documents before continuing.')).length).toBeGreaterThan(0)
 expect(onMandateUploaded).not.toHaveBeenCalled()
})

it('continues from an existing saved mandate without uploading another file', async () => {
 const requirement={id:'mandate-req',subjectId:'p',scopeKey:'property',purpose:'signed_mandate',generation:3,active:true,state:'accepted',documentId:'mandate-doc'}
 const saved={...onboarding,status:'submitted',data:{profile:{name:'Owner'},portfolio:[{id:'p',title:'First home'}]},requirements:[requirement],documents:[{id:'mandate-doc',file_name:'mandate.pdf'}]}
 mocks.request.mockResolvedValue({onboarding:saved})
 const onMandateUploaded=vi.fn().mockResolvedValue(true)
 render(<Panel leadId="lead" revision="saved" initialUploadPurpose="signed_mandate" initialUploadSubject="p" onMandateUploaded={onMandateUploaded}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Continue with saved mandate'}))
 await waitFor(()=>expect(onMandateUploaded).toHaveBeenCalledWith(expect.objectContaining({documentId:'mandate-doc',subjectId:'p'})))
 expect(mocks.upload).not.toHaveBeenCalled()
})
