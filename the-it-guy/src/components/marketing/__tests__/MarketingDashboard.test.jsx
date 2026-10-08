// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MarketingDashboard from '../MarketingDashboard.jsx'
import { getMarketingOverviewDashboard } from '../../../services/marketingOverviewService.js'

const runtime = vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}))
vi.mock('../../../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:runtime}))
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>({currentWorkspace:{organisationId:'agency-1'},currentMembership:{}})}))
let reads
beforeEach(()=>{
  reads=[]
  const now=Date.now()
  const rows={
    leads:[
      {lead_id:'p24-1',lead_source:'Property24',created_at:new Date(now-3600000).toISOString()},
      {lead_id:'p24-2',lead_source:'p24',created_at:new Date(now-7200000).toISOString()},
      {lead_id:'p24-old',lead_source:'Property24',created_at:new Date(now-40*86400000).toISOString()},
      {lead_id:'pp-1',lead_source:'private_property',created_at:new Date(now-3600000).toISOString()},
    ],email_campaigns:[],email_campaign_performance:[],website_sites:[],agency_public_intake_links:[],
  }
  runtime.from.mockImplementation(table=>{
    const query={select(){return this},eq(key,value){reads.push({table,key,value});return this},gte(){return this},order(){return this},limit(){return this},
      maybeSingle:async()=>({data:null,error:null}),then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject)}}
    return query
  })
  runtime.rpc.mockReset()
  runtime.rpc.mockImplementation(()=>{throw new Error('Legacy portal RPC must not be called')})
})
afterEach(()=>{cleanup();vi.clearAllMocks()})

it('uses scoped CRM lead attribution while requesting no legacy Property24 aggregates',async()=>{
  const result=await getMarketingOverviewDashboard({organisationId:'agency-1',range:'7d'})
  expect(result.channelPerformance.find(row=>row.key==='property24')).toMatchObject({leads:2,volume:null,engagement:'—'})
  expect(result.summary.totalLeads.value).toBe(3)
  expect(result.leadSources.find(row=>row.key==='property24').count).toBe(2)
  expect(result).not.toHaveProperty('property24Performance')
  expect(runtime.rpc).not.toHaveBeenCalled()
  expect(reads.filter(row=>row.key==='organisation_id').every(row=>row.value==='agency-1')).toBe(true)
})
it('keeps verified zero imported leads without pretending portal views are zero',async()=>{
  runtime.from.mockImplementation(()=>({select(){return this},eq(){return this},gte(){return this},order(){return this},limit(){return this},maybeSingle:async()=>({data:null}),then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}}))
  const result=await getMarketingOverviewDashboard({organisationId:'agency-1'})
  expect(result.channelPerformance.find(row=>row.key==='property24')).toMatchObject({leads:0,volume:null})
  expect(runtime.rpc).not.toHaveBeenCalled()
})
it('renders CRM counts and explains where listing statistics live, without legacy panels or exports',async()=>{
  render(<MemoryRouter><MarketingDashboard onNavigate={vi.fn()}/></MemoryRouter>)
  const note=await screen.findByText('Imported CRM leads. Portal views and contacts are shown in each listing’s Overview.')
  const row=within(note.closest('tr'))
  expect(row.getByText('Property24')).toBeTruthy()
  expect(row.getByText('2',{exact:true})).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'Property24 portal performance'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'Property24 insights'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'Listing performance'})).toBeNull()
  expect(screen.queryByRole('button',{name:/Export CSV/})).toBeNull()
  fireEvent.change(screen.getByRole('combobox',{name:'Date range'}),{target:{value:'7d'}})
  await screen.findByText('New leads created during last 7 days.')
  expect(runtime.rpc).not.toHaveBeenCalled()
})
