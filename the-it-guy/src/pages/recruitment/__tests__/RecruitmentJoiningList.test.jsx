// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import RecruitmentJoiningList from '../RecruitmentJoiningList'
import { listJoiningRecruitmentLeads } from '../../../services/recruitmentService'
vi.mock('../../../services/recruitmentService',()=>({listJoiningRecruitmentLeads:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const rows=[{id:'joining-one',name:'Joining Agent',email:'joining@example.test',status:'application_submitted',joining_branch_id:'branch-one'}, {id:'joining-two',name:'Other Branch',status:'lead_received',joining_branch_id:'branch-two'}, {id:'activated',name:'Active Agent',status:'agent_activated',joining_branch_id:'branch-one'}, {id:'closed',name:'Closed Agent',status:'closed_lost',joining_branch_id:'branch-one'}]
function Location(){const location=useLocation();return <output>{JSON.stringify(location)}</output>}
it('shows only people joining the selected branch and continues their existing record with a return route',async()=>{
  vi.mocked(listJoiningRecruitmentLeads).mockResolvedValue(rows)
  render(<MemoryRouter><RecruitmentJoiningList organisationId="agency" branchId="branch-one" returnTo="/agency/branches/branch-one/staff"/><Location/></MemoryRouter>)
  await screen.findByText('Joining Agent')
  expect(listJoiningRecruitmentLeads).toHaveBeenCalledWith('agency','branch-one')
  for(const name of ['Other Branch','Active Agent','Closed Agent'])expect(screen.queryByText(name)).toBeNull()
  expect(screen.getByText('Start application review')).toBeTruthy()
  expect(screen.getByText('1 joining')).toBeTruthy()
  fireEvent.click(screen.getByRole('link',{name:'Open recruitment record for Joining Agent'}))
  expect(screen.getByRole('status').textContent).toContain('/agency/recruitment/joining-one')
  expect(screen.getByRole('status').textContent).toContain('/agency/branches/branch-one/staff')
})
it('clears a previous agency immediately, ignores late responses and shows lookup errors with recovery',async()=>{
  let release
  vi.mocked(listJoiningRecruitmentLeads).mockResolvedValueOnce(rows).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve})).mockRejectedValueOnce(new Error('Joining setup is pending.')).mockResolvedValueOnce([])
  const view=render(<MemoryRouter><RecruitmentJoiningList organisationId="first"/></MemoryRouter>)
  await screen.findByText('Joining Agent')
  view.rerender(<MemoryRouter><RecruitmentJoiningList organisationId="second"/></MemoryRouter>)
  expect(screen.queryByText('Joining Agent')).toBeNull()
  view.rerender(<MemoryRouter><RecruitmentJoiningList organisationId="third"/></MemoryRouter>)
  await screen.findByRole('alert')
  release(rows)
  await waitFor(()=>expect(screen.queryByText('Joining Agent')).toBeNull())
  fireEvent.click(screen.getByRole('button',{name:'Refresh joining'}))
  await screen.findByText('No joining records.')
})
it('uses branch progress without offering private record access',async()=>{
 vi.mocked(listJoiningRecruitmentLeads).mockResolvedValue([{id:'branch-recruit',name:'Branch Recruit',status:'application_submitted',joining_branch_id:'branch-one'}])
 render(<MemoryRouter><RecruitmentJoiningList organisationId="agency" branchId="branch-one" limitedBranch /></MemoryRouter>)
 await screen.findByText('Branch Recruit')
 expect(listJoiningRecruitmentLeads).toHaveBeenCalledWith('agency','branch-one',{limitedBranch:true,commercialOnly:false})
 expect(screen.queryByRole('link')).toBeNull()
 expect(screen.getByText('Principal to continue')).toBeTruthy()
 expect(screen.queryByText('Contact pending')).toBeNull()
})
it('makes accepted access and failed sends actionable without claiming inbox delivery',async()=>{
 vi.mocked(listJoiningRecruitmentLeads).mockResolvedValue([{id:'accepted',name:'Accepted Agent',status:'onboarding_complete',activation_state:'awaiting_acceptance',invitation_state:'access_accepted'},{id:'failed',name:'Failed Send',status:'lead_received',invitation_state:'email_failed'}])
 render(<MemoryRouter><RecruitmentJoiningList organisationId="agency" /></MemoryRouter>)
 await screen.findByText('Accepted Agent')
 expect(screen.getByText('Access accepted — verify activation')).toBeTruthy()
 expect(screen.getByText('Confirm verified activation')).toBeTruthy()
 expect(screen.getByText('Invitation email failed')).toBeTruthy()
 expect(screen.getByText('Review invitation sending')).toBeTruthy()
})
