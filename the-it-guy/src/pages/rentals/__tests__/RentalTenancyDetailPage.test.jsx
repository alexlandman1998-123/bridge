// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import RentalTenancyDetailPage from '../RentalTenancyDetailPage.jsx'
const mocks=vi.hoisted(()=>({get:vi.fn(),context:vi.fn(),workspace:{workspace:{id:'org'},profile:{id:'agent'}}}))
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>mocks.workspace}))
vi.mock('../../../services/rentals/rentalApplicationRepository.js',()=>({getPersistedRentalTenancy:mocks.get,getRentalTenancyHandoffContext:mocks.context}))
vi.mock('../../../modules/rentals/shared/tenancies/RentalMoveInPanel.jsx',()=>({default:()=>null}))
vi.mock('../../../modules/rentals/shared/tenancies/RentalLeaseSigningPanel.jsx',()=>({default:()=>null}))
const start=()=>render(<MemoryRouter initialEntries={['/tenancies/saved']}><Routes><Route path="/tenancies/:tenancyId" element={<RentalTenancyDetailPage/>}/></Routes></MemoryRouter>)
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('shows current lease dates and opens the real listing instead of using a managed property ID as its listing reference',async()=>{
 mocks.get.mockResolvedValue({id:'saved',propertyId:'property',sourceApplicationId:'app',status:'draft',tenant:{identity:{firstName:'Saved',lastName:'Tenant'},property:{title:'Saved home'}},lease:{status:'draft',terms_json:{start_date:'old',end_date:'old',monthly_rent:1},rental_lease_versions:[{is_current:true,effective_start_date:'2026-11-01',effective_end_date:'2027-10-31',occupation_date:'2026-11-02',monthly_rent:11000,deposit_amount:22000}]}})
 mocks.context.mockResolvedValue({listingId:'canonical-listing'});start();await screen.findByRole('heading',{name:'Saved home'})
 expect(screen.getByText('2026-11-01')).toBeTruthy();expect(screen.getByText('2027-10-31')).toBeTruthy();expect(screen.queryByText('old')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Mandate & Property'}))
 expect(screen.getByRole('link',{name:'Open rental listing'}).getAttribute('href')).toBe('/agent/rentals/listings/canonical-listing')
 expect(screen.getByRole('link',{name:'Open managed property'}).getAttribute('href')).toBe('/agent/rentals/portfolio/properties/property')
 expect(screen.getByRole('link',{name:'Open approved application'}).getAttribute('href')).toBe('/agent/rentals/applications/app')
})
it('reports a failed tenancy read without leaving an old tenancy visible',async()=>{
 mocks.get.mockRejectedValue(new Error('Local tenancy read failed'));start();await screen.findByText('Local tenancy read failed')
 expect(screen.queryByRole('heading',{name:'Saved home'})).toBeNull()
})
