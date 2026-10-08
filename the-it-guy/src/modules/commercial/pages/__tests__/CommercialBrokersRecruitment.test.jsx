// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const branch='a1111111-1111-4111-8111-111111111111'
const api=vi.hoisted(()=>({role:'principal',create:vi.fn(async()=>({})),capture:vi.fn(),list:vi.fn(async()=>[])}))
vi.mock('../../../../context/WorkspaceContext',()=>({useWorkspace:()=>({organisationMembershipRole:api.role,currentMembership:{role:api.role,branchId:'a1111111-1111-4111-8111-111111111111'}})}))
vi.mock('../../hooks/useCommercialData',()=>({useCommercialData:()=>({organisationId:'agency',data:{brokers:[],teams:[],branchRows:[{id:'a1111111-1111-4111-8111-111111111111',name:'Head Office'}],summary:{}},loading:false,error:''})}))
vi.mock('../../../../services/workspaceUserInviteService',()=>({createWorkspaceUserInvite:api.create,listWorkspaceUserInvites:api.list,resendWorkspaceUserInvite:vi.fn(),revokeWorkspaceUserInvite:vi.fn()}))
vi.mock('../../../../services/recruitmentService',()=>({captureBranchRecruitmentLead:api.capture,listJoiningRecruitmentLeads:vi.fn(async()=>[])}))
vi.mock('../../../../pages/recruitment/RecruitmentIntakeLinks',()=>({default:()=> <p>Private application links</p>}))
import CommercialBrokersPage from '../CommercialBrokersPage'
function Destination(){const location=useLocation();return <output aria-label="Recruitment destination">{JSON.stringify(location.state)}</output>}
function renderPage(){render(<MemoryRouter initialEntries={['/commercial/brokers']}><Routes><Route path="/commercial/brokers" element={<CommercialBrokersPage/>}/><Route path="/agency/recruitment/new" element={<Destination/>}/></Routes></MemoryRouter>)}
beforeEach(()=>{api.role='principal';api.create.mockResolvedValue({});api.list.mockResolvedValue([])})
afterEach(()=>{cleanup();vi.clearAllMocks()})
async function fill(){
 fireEvent.click(screen.getAllByRole('button',{name:'Add Broker'})[0])
 const dialog=within(screen.getByRole('dialog',{name:'Add Broker or staff access'}))
 fireEvent.change(dialog.getByLabelText('First Name *'),{target:{value:'New'}})
 fireEvent.change(dialog.getByLabelText('Last Name *'),{target:{value:'Broker'}})
 fireEvent.change(dialog.getByLabelText('Email *'),{target:{value:'broker@example.test'}})
 fireEvent.change(dialog.getByLabelText('Branch / Office *'),{target:{value:branch}})
 return dialog
}
it('starts a broker joining record without sending access and keeps applicants out of broker totals',async()=>{
 renderPage();const dialog=await fill()
 expect(dialog.queryByText('3. Commercial Specialisation')).toBeNull()
 fireEvent.click(dialog.getByRole('button',{name:'Continue in Recruitment'}))
 const entry=JSON.parse((await screen.findByLabelText('Recruitment destination')).textContent).recruitmentEntry
 expect(entry).toMatchObject({entryPoint:'commercial_brokers',organisationId:'agency',branchId:branch,joiningRole:'commercial_broker',businessWorkspaces:['commercial'],contact:{name:'New Broker',email:'broker@example.test'},returnTo:'/commercial/brokers'})
 expect(api.create).not.toHaveBeenCalled()
})
it('preserves explicit existing broker access and specialisation',async()=>{
 renderPage();const dialog=await fill()
 fireEvent.change(dialog.getByRole('combobox',{name:/Invitation purpose/}),{target:{value:'existing_staff'}})
 expect(dialog.getByText('3. Commercial Specialisation')).toBeTruthy()
 fireEvent.click(dialog.getByRole('button',{name:'Send Invite'}))
 await waitFor(()=>expect(api.create).toHaveBeenCalledWith(expect.objectContaining({role:'commercial_broker',branchId:branch,metadata:expect.objectContaining({access_purpose:'existing_staff',module:'commercial'})})))
 expect(api.capture).not.toHaveBeenCalled()
})
it('lets a branch manager capture their own branch enquiry without opening private application links',async()=>{
 api.role='branch_manager';api.capture.mockResolvedValue({id:'branch-recruit',name:'New Broker',status:'lead_received'})
 renderPage();const dialog=await fill()
 fireEvent.click(dialog.getByRole('button',{name:'Continue in Recruitment'}))
 const capture=within(await screen.findByRole('dialog',{name:'Invite new agent'}))
 expect(capture.queryByLabelText('Recruitment notes')).toBeNull()
 fireEvent.click(capture.getByRole('button',{name:'Create Agent Lead'}))
 await waitFor(()=>expect(api.capture).toHaveBeenCalledWith('agency',branch,expect.objectContaining({name:'New Broker',email:'broker@example.test'})))
 await capture.findByText(/Joining record saved/)
 expect(capture.queryByRole('link')).toBeNull()
 expect(capture.queryByText('Private application links')).toBeNull()
 expect(api.create).not.toHaveBeenCalled()
})
