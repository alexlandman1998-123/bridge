// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api=vi.hoisted(()=>({load:vi.fn(),listJoining:vi.fn(),createAccess:vi.fn(),workspace:{role:'agent',baseRole:'agent',profile:{id:'manager',email:'manager@example.test',fullName:'Principal'},workspaceReady:true,profileLoading:false,currentMembership:{role:'principal',organisationId:'agency',workspaceType:'agency'},workspaceRole:'principal',workspaceType:'agency'}}))
vi.mock('../../context/WorkspaceContext',()=>({useWorkspace:()=>api.workspace}))
vi.mock('../../lib/api',()=>({saveTransaction:vi.fn()}))
vi.mock('../../lib/supabaseClient',()=>({isSupabaseConfigured:true,invokeEdgeFunction:vi.fn()}))
vi.mock('../../lib/settingsApi',()=>({fetchOrganisationSettings:vi.fn(async()=>({organisation:{id:'agency',name:'Test Agency'},membershipRole:'principal'})),listOrganisationCommissionStructures:vi.fn(async()=>[]),deactivateOrganisationUser:vi.fn(),assignOrganisationUserCommissionProfile:vi.fn(),listOrganisationUserCommissionProfiles:vi.fn(),listOrganisationUsers:vi.fn(),updateOrganisationUserProfile:vi.fn(),updateOrganisationUserRole:vi.fn(),uploadAccountAvatar:vi.fn()}))
vi.mock('../../modules/agency/agents/agentPerformanceDataService',()=>({loadAgentPerformanceSources:api.load}))
vi.mock('../../services/workspaceUserInviteService',()=>({createWorkspaceUserInvite:api.createAccess,listWorkspaceUserInvites:vi.fn(async()=>[]),resendWorkspaceUserInvite:vi.fn(),revokeWorkspaceUserInvite:vi.fn()}))
vi.mock('../../services/recruitmentService',()=>({listJoiningRecruitmentLeads:api.listJoining}))
vi.mock('../../components/agents/AgentWorkspaceListings',()=>({default:()=>null}))
vi.mock('../../components/leads/LeadsRouteShell',()=>({default:()=>null}))
vi.mock('../../components/appointments/dashboard/AppointmentDashboardSection',()=>({default:()=>null}))
vi.mock('../../components/AgentTransactionsTable',()=>({default:()=>null}))
vi.mock('../../components/commission/InlineCommissionStructure',()=>({default:()=>null}))
import { AgentsPage } from '../Agents'
function Destination(){const location=useLocation();return <output aria-label="Joining destination">{JSON.stringify(location.state)}</output>}
function showAgents(){return render(<MemoryRouter initialEntries={['/agency/agents']}><Routes><Route path="/agency/agents" element={<AgentsPage/>}/><Route path="/agency/recruitment/new" element={<Destination/>}/></Routes></MemoryRouter>)}
beforeEach(()=>{
  localStorage.clear()
  api.load.mockResolvedValue({organisationSettings:{organisation:{id:'agency',name:'Test Agency'},membershipRole:'principal'},organisationUsers:[],transactions:[],transactionRolePlayers:[],branches:[],leads:[],leadActivities:[],tasks:[],appointments:[],canvassingProspects:[],canvassingActivities:[],listings:[]})
  api.listJoining.mockResolvedValue([{id:'applicant',name:'Prospective Agent',email:'new@example.test',status:'under_review'}])
})
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('opens Recruitment from the directory and keeps applicants in a separate list',async()=>{
  showAgents()
  await screen.findByText('Prospective Agent')
  expect(screen.getByRole('region',{name:'Joining'}).textContent).toContain('Complete application review')
  expect(screen.getByRole('button',{name:'Existing staff access'})).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button',{name:'Invite new agent'})[0])
  expect(JSON.parse(screen.getByLabelText('Joining destination').textContent).recruitmentEntry).toEqual({entryPoint:'agents',organisationId:'agency',branchId:'',returnTo:'/agency/agents'})
  expect(api.createAccess).not.toHaveBeenCalled()
})
it('routes the existing toolbar Add Agent event into Recruitment without creating an access invite',async()=>{
  showAgents()
  await screen.findByText('Prospective Agent')
  fireEvent(window,new Event('itg:open-add-agent'))
  expect(JSON.parse(screen.getByLabelText('Joining destination').textContent).recruitmentEntry.entryPoint).toBe('agents')
  expect(api.createAccess).not.toHaveBeenCalled()
})
