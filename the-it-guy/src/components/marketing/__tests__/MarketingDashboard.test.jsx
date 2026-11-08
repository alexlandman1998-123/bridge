// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import MarketingDashboard from '../MarketingDashboard.jsx'
import { getMarketingOverviewDashboard } from '../../../services/marketingOverviewService.js'

const runtime = vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn()}))
vi.mock('../../../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:runtime}))
vi.mock('../../../context/WorkspaceContext',()=>({useWorkspace:()=>({currentWorkspace:{organisationId:'agency-1'},currentMembership:{}})}))
let reads
let rows
beforeEach(()=>{
  reads=[]
  const now=Date.now()
  rows={
    leads:[
      {lead_id:'p24-1',lead_source:'Property24',created_at:new Date(now-3600000).toISOString()},
      {lead_id:'p24-2',lead_source:'p24',created_at:new Date(now-7200000).toISOString()},
      {lead_id:'p24-old',lead_source:'Property24',created_at:new Date(now-40*86400000).toISOString()},
      {lead_id:'pp-1',lead_source:'private_property',created_at:new Date(now-3600000).toISOString()},
    ],email_campaigns:[],email_campaign_performance:[],website_sites:[],agency_public_intake_links:[],
  }
  runtime.from.mockImplementation(table=>{
    const query={select(){return this},eq(key,value){reads.push({table,key,value});return this},in(key,value){reads.push({table,key,value});return this},gte(){return this},order(){return this},limit(){return this},
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
  expect(result.leadsOverTime.reduce((sum,row)=>sum+(row.sources.property24||0),0)).toBe(2)
  expect(result.leadsOverTime.reduce((sum,row)=>sum+(row.sources.private_property||0),0)).toBe(1)
  expect(result.leadsOverTime.every(row=>Object.values(row.sources).reduce((sum,count)=>sum+count,0)===row.totalLeads)).toBe(true)
  expect(result.leadsOverTime.some(row=>row.totalLeads===0&&Object.keys(row.sources).length===0)).toBe(true)
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
  const row=within(note.closest('section'))
  expect(row.getByText('Property24')).toBeTruthy()
  expect(row.getByText('2',{exact:true})).toBeTruthy()
  const sources=within(screen.getByRole('heading',{name:'Lead sources'}).closest('article'))
  const logo=sources.getByRole('img',{name:'Property24 logo'})
  expect(logo.getAttribute('src')).toBe('/lead-sources/property24.png')
  fireEvent.error(logo)
  expect(sources.queryByRole('img',{name:'Property24 logo'})).toBeNull()
  expect(sources.getByText('Property24')).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'Property24 portal performance'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'Property24 insights'})).toBeNull()
  expect(screen.queryByRole('heading',{name:'Listing performance'})).toBeNull()
  expect(screen.queryByRole('button',{name:/Export CSV/})).toBeNull()
  fireEvent.change(screen.getByRole('combobox',{name:'Date range'}),{target:{value:'7d'}})
  await screen.findByText('New leads created during last 7 days.')
  expect(runtime.rpc).not.toHaveBeenCalled()
})

it('compares daily source lines and lets the user hide one without hiding total leads',async()=>{
  render(<MemoryRouter><MarketingDashboard onNavigate={vi.fn()}/></MemoryRouter>)
  const source=await screen.findByRole('button',{name:'Property24',pressed:true})
  expect(screen.getByRole('img',{name:'Total leads, Property24, Private Property over time'})).toBeTruthy()
  fireEvent.click(source)
  expect(screen.getByRole('button',{name:'Property24',pressed:false})).toBeTruthy()
  expect(screen.getByRole('img',{name:'Total leads, Private Property over time'})).toBeTruthy()
  fireEvent.click(source)
  expect(screen.getByRole('img',{name:'Total leads, Property24, Private Property over time'})).toBeTruthy()
})

it('selects channel breakdowns while keeping missing portal figures distinct from zero leads',async()=>{
  render(<MemoryRouter><MarketingDashboard onNavigate={vi.fn()}/></MemoryRouter>)
  const property24=await screen.findByRole('button',{name:'View Property24 performance',pressed:true})
  const portal=within(screen.getByRole('region',{name:'Property24 performance'}))
  expect(portal.getAllByText('Not reported')).toHaveLength(2)
  expect(screen.queryByRole('columnheader',{name:'Cost per lead'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'View Private Property performance'}))
  expect(screen.getByRole('button',{name:'View Private Property performance',pressed:true})).toBeTruthy()
  expect(screen.getByRole('region',{name:'Private Property performance'})).toBeTruthy()
  expect(screen.queryByRole('region',{name:'Property24 performance'})).toBeNull()
  fireEvent.click(property24)
  expect(screen.getByRole('region',{name:'Property24 performance'})).toBeTruthy()
})

it('loads only the recent campaign previews in agency scope and renders full campaign rows',async()=>{
  rows.email_campaigns=Array.from({length:6},(_,index)=>({id:`campaign-${index}`,name:`Autumn collection ${index}`,subject:'Homes selected for you',status:'sent',sent_at:new Date().toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),content_json:{blocks:[{type:'image',src:'javascript:invalid'},{type:'property',listings:[{image:'https://images.example.test/home.jpg'}]}]}}))
  rows.email_campaign_performance=[{campaign_id:'campaign-0',recipients:100,delivered:98,clicked:12}]
  const result=await getMarketingOverviewDashboard({organisationId:'agency-1'})
  expect(result.recentCampaigns).toHaveLength(5)
  expect(result.recentCampaigns[0].thumbnailUrl).toBe('https://images.example.test/home.jpg')
  expect(reads.find(row=>row.table==='email_campaigns'&&row.key==='id').value).toEqual(['campaign-0','campaign-1','campaign-2','campaign-3','campaign-4'])
  expect(reads.filter(row=>row.table==='email_campaigns'&&row.key==='organisation_id').every(row=>row.value==='agency-1')).toBe(true)
  function CurrentRoute() { const location=useLocation(); return <output aria-label="Current route">{location.pathname}{location.search}</output> }
  render(<MemoryRouter><MarketingDashboard onNavigate={vi.fn()}/><CurrentRoute/></MemoryRouter>)
  const row=within(await screen.findByRole('button',{name:'Open campaign Autumn collection 0'}))
  expect(row.getByText('Email')).toBeTruthy()
  expect(row.getByText('98%')).toBeTruthy()
  expect(row.getByText('100 recipients')).toBeTruthy()
  expect(screen.queryByRole('heading',{name:'New leads'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Open campaign Autumn collection 0'}))
  expect(screen.getByLabelText('Current route').textContent).toBe('/marketing?section=email&view=detail&id=campaign-0')
})

it('keeps recent campaigns available when optional thumbnail loading fails',async()=>{
  rows.email_campaigns=[{id:'campaign-no-image',name:'Campaign without an image',status:'draft',created_at:new Date().toISOString()}]
  const from=runtime.from.getMockImplementation()
  runtime.from.mockImplementation(table=>{const query=from(table);if(table==='email_campaigns')query.in=()=>{throw new Error('Preview unavailable')};return query})
  const result=await getMarketingOverviewDashboard({organisationId:'agency-1'})
  expect(result.recentCampaigns).toHaveLength(1)
  expect(result.recentCampaigns[0]).toMatchObject({name:'Campaign without an image',thumbnailUrl:''})
})
