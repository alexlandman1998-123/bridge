// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import RentalLeadWorkspacePage from '../RentalLeadWorkspacePage.jsx'
const mocks=vi.hoisted(()=>({load:vi.fn(),applications:vi.fn(),choices:vi.fn(),prepare:vi.fn(),issue:vi.fn(),workspace:{workspace:{id:'org'},profile:{id:'agent'},workspaceRole:'owner'}}))
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>mocks.workspace}))
vi.mock('../../../services/rentals/rentalLeadService',()=>({getRentalLeadWorkspace:mocks.load,advanceRentalLead:vi.fn()}))
vi.mock('../../../services/rentals/rentalApplicationRepository.js',()=>({listPersistedRentalApplicationsForLead:mocks.applications,savePersistedRentalApplication:vi.fn()}))
vi.mock('../../../services/rentals/rentalTenantApplicationService.js',()=>({listRentalTenantApplicationChoices:mocks.choices,prepareRentalTenantApplication:mocks.prepare,issueRentalTenantApplicationInvite:mocks.issue,revokeRentalTenantApplicationInvite:vi.fn()}))
vi.mock('../RentalTenantLeadWorkspace',()=>({default:({lead,applicationContent,parentError})=><><h1>{lead.name}</h1>{parentError?<p role="alert">{parentError}</p>:null}{applicationContent}<Link to="/leads/second">Open second tenant</Link></>}))
vi.mock('../RentalLandlordLeadWorkspace',()=>({default:()=>null}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const vacancy={id:'vacancy',listingId:'listing',title:'Saved home',unitLabel:'MAIN',eligible:true}
const app={id:'app',leadId:'first',vacancyId:'vacancy',status:'draft',version:1,data:{}}
function start(){
 mocks.load.mockImplementation(async(org,id)=>({lead:{id,role:'tenant',name:`Tenant ${id}`,stage:'application_pending',relationships:{vacancyId:'vacancy'}}}))
 mocks.applications.mockResolvedValue([]);mocks.choices.mockResolvedValue([vacancy]);mocks.prepare.mockResolvedValue(app)
 render(<MemoryRouter initialEntries={['/leads/first']}><Routes><Route path="/leads/:leadId" element={<RentalLeadWorkspacePage/>}/><Route path="/agent/rentals/applications/:applicationId" element={<p>Saved application review</p>}/></Routes></MemoryRouter>)
}
it('prepares the saved lead/vacancy connection before issuing a link without advancing its stage',async()=>{
 start();mocks.issue.mockResolvedValue({id:'access',token:'secret',application:app})
 await screen.findByRole('button',{name:'Create secure application link'})
 fireEvent.click(screen.getByRole('button',{name:'Create secure application link'}))
 await waitFor(()=>expect(mocks.issue).toHaveBeenCalledWith(app,{expiresInMinutes:10080}))
 expect(mocks.prepare).toHaveBeenCalledWith('org','first','vacancy')
 expect(mocks.load).toHaveBeenCalledTimes(2)
})
it('does not show another tenant’s link or retain an old selected vacancy after a route change',async()=>{
 start();let resolve;mocks.issue.mockImplementation(()=>new Promise(done=>{resolve=done}))
 await screen.findByRole('button',{name:'Create secure application link'})
 fireEvent.click(screen.getByRole('button',{name:'Create secure application link'}));await waitFor(()=>expect(mocks.issue).toHaveBeenCalledTimes(1))
 mocks.load.mockImplementation(async(org,id)=>({lead:{id,role:'tenant',name:`Tenant ${id}`,stage:'application_pending',relationships:{}}}))
 mocks.choices.mockResolvedValue([{...vacancy,id:'other-vacancy'}])
 fireEvent.click(screen.getByRole('link',{name:'Open second tenant'}));await screen.findByText('Tenant second')
 resolve({id:'access',token:'old-tenant-secret',application:app})
 await waitFor(()=>expect(screen.getByLabelText('Application property').value).toBe(''))
 expect(screen.queryByDisplayValue(/old-tenant-secret/)).toBeNull()
})
it('opens the saved submitted application instead of creating another invitation',async()=>{
 start();mocks.prepare.mockResolvedValue({...app,status:'submitted'})
 await screen.findByRole('button',{name:'Create secure application link'})
 fireEvent.click(screen.getByRole('button',{name:'Create secure application link'}))
 await screen.findByText('Saved application review');expect(mocks.issue).not.toHaveBeenCalled()
})
