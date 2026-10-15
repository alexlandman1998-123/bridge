// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import RentalApplicationTenancyConversionPanel from './RentalApplicationTenancyConversionPanel.jsx'
import * as repository from '../../../../services/rentals/rentalApplicationRepository.js'
vi.mock('../../../../services/rentals/rentalApplicationRepository.js',()=>({getRentalApplicationTenancyConversion:vi.fn(),getRentalTenancyHandoffContext:vi.fn(),convertRentalApplicationToTenancy:vi.fn()}))
const app={id:'app',status:'approved',version:7}
beforeEach(()=>{vi.resetAllMocks();repository.getRentalApplicationTenancyConversion.mockResolvedValue(null);repository.getRentalTenancyHandoffContext.mockResolvedValue({applicationId:'app',leadId:'lead',leadStage:'placement_ready',canCreate:true})})
afterEach(cleanup)
it('requires Placement ready even after the application has been approved',async()=>{
 repository.getRentalTenancyHandoffContext.mockResolvedValue({applicationId:'app',leadId:'lead',leadStage:'fica_complete',canCreate:false})
 render(<MemoryRouter><RentalApplicationTenancyConversionPanel application={app}/></MemoryRouter>)
 await screen.findByText(/Current tenant stage: fica complete/)
 expect(screen.getByRole('button',{name:'Create tenancy draft'}).disabled).toBe(true)
 expect(screen.getByRole('link',{name:'Open tenant lead'}).getAttribute('href')).toBe('/agent/rentals/pipeline/leads/lead')
})
it('keeps the saved tenancy openable when the parent refresh fails after conversion',async()=>{
 repository.convertRentalApplicationToTenancy.mockResolvedValue({tenancy_id:'saved-tenancy',lease_id:'saved-lease'})
 const onConverted=vi.fn().mockRejectedValue(new Error('Local refresh failed'))
 render(<MemoryRouter><RentalApplicationTenancyConversionPanel application={app} onConverted={onConverted}/></MemoryRouter>)
 const button=await screen.findByRole('button',{name:'Create tenancy draft'});await waitFor(()=>expect(button.disabled).toBe(false));fireEvent.click(button)
 await screen.findByText('Tenancy saved. Refresh its details: Local refresh failed')
 expect(screen.getByRole('link',{name:/Open tenancy workspace/}).getAttribute('href')).toBe('/agent/rentals/tenancies/saved-tenancy')
 expect(repository.convertRentalApplicationToTenancy).toHaveBeenCalledWith({applicationId:'app',expectedVersion:7})
 expect(screen.queryByRole('button',{name:'Create tenancy draft'})).toBeNull()
})
it('does not show an earlier application’s conversion after selecting another application',async()=>{
 let resolve;repository.convertRentalApplicationToTenancy.mockImplementation(()=>new Promise(done=>{resolve=done}))
 const view=render(<MemoryRouter><RentalApplicationTenancyConversionPanel application={app}/></MemoryRouter>)
 const button=await screen.findByRole('button',{name:'Create tenancy draft'});await waitFor(()=>expect(button.disabled).toBe(false));fireEvent.click(button)
 repository.getRentalTenancyHandoffContext.mockResolvedValue({applicationId:'second',leadId:'other-lead',leadStage:'qualified',canCreate:false})
 view.rerender(<MemoryRouter><RentalApplicationTenancyConversionPanel application={{...app,id:'second'}}/></MemoryRouter>)
 await screen.findByText(/Current tenant stage: qualified/);resolve({tenancy_id:'old-tenancy',lease_id:'old-lease'})
 await waitFor(()=>expect(screen.queryByRole('link',{name:/Open tenancy workspace/})).toBeNull())
})
