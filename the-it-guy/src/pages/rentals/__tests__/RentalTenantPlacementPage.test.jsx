// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import RentalTenantPlacementPage from '../RentalTenantPlacementPage.jsx'
const mocks=vi.hoisted(()=>({leads:vi.fn(),apps:vi.fn(),workspace:{workspace:{id:'org'},profile:{id:'agent'},workspaceRole:'owner'}}))
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>mocks.workspace}))
vi.mock('../../../services/rentals/rentalLeadService',()=>({listRentalLeads:mocks.leads}))
vi.mock('../../../services/rentals/rentalApplicationRepository.js',()=>({listPersistedRentalApplicationsForLead:mocks.apps}))
vi.mock('../../../modules/rentals/shared/applications/RentalApplicationTenancyConversionPanel.jsx',()=>({default:({application})=><p>Prepare saved application {application.id}</p>}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('uses the approved application’s selected property and the shared real tenancy command',async()=>{
 mocks.leads.mockResolvedValue([{id:'lead',name:'Saved Tenant',role:'tenant',stage:'placement_ready',relationships:{applicationId:'approved'}},{id:'owner',name:'Owner',role:'landlord',stage:'placement_ready'}])
 mocks.apps.mockResolvedValue([{id:'approved',status:'approved',data:{property:{title:'Approved home'}}},{id:'draft',status:'draft',data:{property:{title:'Unreviewed home'}}}])
 render(<MemoryRouter><RentalTenantPlacementPage/></MemoryRouter>);await screen.findByRole('option',{name:/Saved Tenant/})
 fireEvent.change(screen.getByLabelText('Placement-ready tenant'),{target:{value:'lead'}})
 await screen.findByText('Prepare saved application approved')
 expect(mocks.apps).toHaveBeenCalledWith('org','lead');expect(screen.getByRole('option',{name:'Approved home'})).toBeTruthy()
 expect(screen.queryByRole('option',{name:'Unreviewed home'})).toBeNull();expect(screen.queryByRole('option',{name:/Owner/})).toBeNull()
 expect(screen.queryByLabelText('Rental listing')).toBeNull();expect(screen.queryByLabelText('Application reference')).toBeNull()
})
it('does not choose an arbitrary application when more than one approved application lacks a current lead connection',async()=>{
 mocks.leads.mockResolvedValue([{id:'lead',name:'Saved Tenant',role:'tenant',stage:'placement_ready',relationships:{}}]);mocks.apps.mockResolvedValue(['one','two'].map(id=>({id,status:'approved',data:{property:{title:id}}})))
 render(<MemoryRouter><RentalTenantPlacementPage/></MemoryRouter>);await screen.findByRole('option',{name:/Saved Tenant/});fireEvent.change(screen.getByLabelText('Placement-ready tenant'),{target:{value:'lead'}})
 await screen.findByRole('option',{name:'two'});expect(screen.getByLabelText('Approved application and property').value).toBe('')
 expect(screen.queryByText(/Prepare saved application/)).toBeNull()
})
