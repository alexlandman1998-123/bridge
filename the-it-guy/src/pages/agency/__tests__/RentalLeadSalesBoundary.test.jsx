// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgencyLeadWorkspaceShellPage from '../AgencyLeadWorkspaceShellPage.jsx'
import { resolveAgencyLeadWorkspaceRedirect } from '../agencyLeadWorkspaceRouteState.js'
const fixture=vi.hoisted(()=>({core:null}))
vi.mock('../../../context/WorkspaceContextBase',()=>({useWorkspace:()=>({currentWorkspace:{id:'org'}})}))
vi.mock('../agencyLeadCoreCache',()=>({readAgencyLeadCoreCache:()=>fixture.core}))
vi.mock('../agencyLeadListReadRepository',()=>({preloadAgencyLeadCoreRecord:async()=>fixture.core}))
afterEach(cleanup)
it.each(['tenant','landlord'])('opens a saved %s rental lead at its rental route instead of rendering sales tabs',async role=>{
  fixture.core={lead:{leadId:'lead',leadCategory:role==='landlord'?'seller':'buyer',rawEnquiryPayload:{rentalCrm:{classification:'rental',role}}},contact:{firstName:'Fixture',lastName:role}}
  render(<MemoryRouter initialEntries={['/pipeline/leads/lead?tab=documents']}><Routes><Route path="/pipeline/leads/:leadId" element={<AgencyLeadWorkspaceShellPage/>}/><Route path="/agent/rentals/pipeline/leads/:leadId" element={<p>Rental journey</p>}/></Routes></MemoryRouter>)
  expect(await screen.findByText('Rental journey')).toBeTruthy()
  expect(screen.queryByRole('tab',{name:/Seller Profile|Buyer Profile/})).toBeNull()
})
it('retains sales routing for a sales investment property and escapes the saved rental identity',()=>{
  expect(resolveAgencyLeadWorkspaceRedirect({leadId:'sale',leadCategory:'seller',notes:'Rental investment for sale'})).toBe('')
  expect(resolveAgencyLeadWorkspaceRedirect({leadId:'a/b',rawEnquiryPayload:{arch9RentalLead:'true'}})).toBe('/agent/rentals/pipeline/leads/a%2Fb')
})
