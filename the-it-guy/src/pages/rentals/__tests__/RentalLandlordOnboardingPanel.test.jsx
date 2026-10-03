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
 const {rerender}=render(<Panel leadId='lead' revision='saved' discoveryDirty/>);await screen.findByLabelText('Upload Owner: Identity evidence')
 expect(screen.getByLabelText('Upload Owner: Identity evidence').disabled).toBe(true)
 rerender(<Panel leadId='lead' revision='saved'/>);
 fireEvent.change(screen.getByLabelText('Upload Owner: Identity evidence'),{target:{files:[file]}})
 await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce())
 expect(mocks.upload.mock.calls[0].slice(0,3)).toEqual([file,{requirementId:'req',generation:2,subjectId:'primary',purpose:'identity'},4])
 expect(await screen.findByText('ID.pdf uploaded.')).toBeTruthy()
})
