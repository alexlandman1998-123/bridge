// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({updateBranch:vi.fn(),createWorkspaceUserInvite:vi.fn()}))
vi.mock('../../../services/agencyBranchService', () => ({updateBranch:api.updateBranch}))
vi.mock('../../../services/workspaceUserInviteService', () => ({createWorkspaceUserInvite:api.createWorkspaceUserInvite,resendWorkspaceUserInvite:vi.fn()}))
vi.mock('../../../lib/location/upsertArea', () => ({upsertAreaFromAddress:vi.fn(async()=>null)}))
vi.mock('../../../components/location/AddressAutocomplete', () => ({default:()=>null}))
import { BranchSettingsForm, BranchAgentInviteModal } from '../AgencyBranchWorkspacePage'
const branch={id:'branch-test',organisationId:'agency-test',name:'Cape Town',address:'12 Main Road',email:'branch@example.test',phone:'0210000000',coverImageUrl:'',principalUserId:'',members:[]}
afterEach(()=>{cleanup();vi.clearAllMocks()})
beforeEach(()=>{api.updateBranch.mockImplementation(async(id,fields)=>({...branch,...fields}));api.createWorkspaceUserInvite.mockResolvedValue({invite:{id:'test-invite'}})})
it('saves branch edits, confirms read-back and displays saved values after reopening', async()=>{
 const onSaved=vi.fn();const view=render(<BranchSettingsForm branch={branch} onSaved={onSaved}/>);
 fireEvent.change(screen.getByLabelText('Branch Name'),{target:{value:'Cape Town Updated'}})
 fireEvent.change(screen.getByLabelText('Branch Phone'),{target:{value:'0211111111'}})
 fireEvent.click(screen.getByRole('button',{name:'Save Branch'}))
 await screen.findByText('Branch settings saved.')
 expect(api.updateBranch).toHaveBeenCalledWith('branch-test',expect.objectContaining({name:'Cape Town Updated',phone:'0211111111'}))
 const saved=onSaved.mock.calls[0][0];view.unmount();render(<BranchSettingsForm branch={saved}/>);
 expect(screen.getByLabelText('Branch Name').value).toBe('Cape Town Updated')
 expect(screen.getByLabelText('Branch Phone').value).toBe('0211111111')
})
it('does not claim success or update the page when saved values cannot be confirmed', async()=>{
 api.updateBranch.mockResolvedValue(branch);const onSaved=vi.fn();render(<BranchSettingsForm branch={branch} onSaved={onSaved}/>);
 fireEvent.change(screen.getByLabelText('Branch Name'),{target:{value:'Unconfirmed'}});fireEvent.click(screen.getByRole('button',{name:'Save Branch'}));
 await screen.findByText(/changes could not be confirmed/);expect(onSaved).not.toHaveBeenCalled();expect(screen.queryByText('Branch settings saved.')).toBeNull()
})
it('submits staff invitations with the selected branch, organisation and commission structure', async()=>{
 const onSent=vi.fn();render(<BranchAgentInviteModal open branch={branch} organisation={{id:'agency-test',name:'Agency'}} commissionStructures={[{id:'commission-test',name:'Standard',isDefault:true}]} onSent={onSent} onClose={vi.fn()}/>);
 for(const [label,value] of [['First Name','Test'],['Surname','Agent'],['Email Address','agent@example.test'],['Mobile Number','0710000000']]) fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));
 await waitFor(()=>expect(onSent).toHaveBeenCalledWith({id:'test-invite'}))
 expect(api.createWorkspaceUserInvite).toHaveBeenCalledWith(expect.objectContaining({workspaceId:'agency-test',branchId:'branch-test',role:'agent',commissionStructureId:'commission-test'}))
})

it('renders branch leads with the Pipeline row design and keeps financial restrictions and keyboard navigation', async () => {
  const { BranchLeadsTable } = await import('../AgencyBranchWorkspacePage')
  const onOpen = vi.fn()
  render(<BranchLeadsTable leads={[{ lead_id: 'lead-one', name: 'Alex Buyer', phone: '27820000000', enquired_listing_id: 'listing-one', lead_source: 'Property24', stage: 'qualified', budget: 999999 }]} listings={[{ id: 'listing-one', title: 'Parkhurst home', formatted_address: '7 Sixth Street', coverImageUrl: 'https://example.test/home.jpg' }]} assignedAgentName={() => 'Pat Agent'} onOpenLead={onOpen} />)
  const table = screen.getByRole('table')
  expect(table.textContent).toContain('Parkhurst home')
  expect(table.textContent).toContain('Alex Buyer')
  expect(table.textContent).toContain('Pat Agent')
  expect(table.textContent).not.toContain('999')
  expect(screen.getAllByAltText('Property24')).toHaveLength(2)
  const row = screen.getByRole('row', { name: 'Open lead Alex Buyer' })
  fireEvent.keyDown(row, { key: 'Enter' })
  expect(onOpen).toHaveBeenCalledWith('lead-one')
})
