// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExternalWebsiteWorkspace } from '../SettingsExternalWebsitesPage'
const organisationId='322c3853-2d82-4413-97e6-b4cd8bc32a7c'
const connection={id:'connection',name:'Revo Main',website_url:'https://revo.example.test',mode:'leads_only',scope:'organisation',scopeLabel:'Revo organisation',enabled:true,fallback_user_id:'fallback',credentialsConfigured:true,branch_ids:[],recentFailures:0}
const overview={connections:[],branches:[],developments:[],users:[{id:'fallback',name:'Revo Principal'}]}
afterEach(cleanup)

describe('External Websites controls',()=>{
  it('creates via the backend, shows secrets once, and clears them on refresh of detail',async()=>{
    const manage=vi.fn(async(_org,action='list',_id,config)=>{
      if(action==='list')return overview
      if(action==='create')return {connection:{...connection,...config},credential:'one-time-token',webhookSecret:'one-time-signing-secret',activity:[],deliveries:[]}
      return {connection,activity:[],deliveries:[]}
    })
    render(<ExternalWebsiteWorkspace organisationId={organisationId} manage={manage} />)
    fireEvent.click(await screen.findByRole('button',{name:'New website'}))
    fireEvent.change(screen.getByLabelText('Website name'),{target:{value:'Revo Main'}})
    fireEvent.change(screen.getByLabelText('Website URL'),{target:{value:'https://revo.example.test'}})
    fireEvent.change(screen.getByLabelText('Fallback enquiry assignee'),{target:{value:'fallback'}})
    fireEvent.click(screen.getByRole('button',{name:'Create connection'}))
    expect(await screen.findByLabelText('Backend API credential')).toHaveProperty('value','one-time-token')
    expect(manage.mock.calls.find(call=>call[1]==='create')[3]).toMatchObject({name:'Revo Main',mode:'leads_only',fallback_user_id:'fallback'})
    fireEvent.click(screen.getByRole('button',{name:'Hide credentials'}))
    expect(screen.queryByLabelText('Backend API credential')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'Revoke credentials'}))
    await waitFor(()=>expect(manage).toHaveBeenCalledWith(organisationId,'revoke','connection',{}))
    expect(screen.queryByLabelText('Backend API credential')).toBeNull()
  })
  it('keeps failed backend actions visible without a success state',async()=>{
    const manage=vi.fn(async(_org,action='list')=>{if(action==='list')return {...overview,connections:[connection]};if(action==='detail')return {connection,activity:[],deliveries:[]};throw new Error('Administrator permission required')})
    render(<ExternalWebsiteWorkspace organisationId={organisationId} manage={manage} />)
    fireEvent.click(await screen.findByRole('button',{name:/Revo Main/}))
    fireEvent.click(await screen.findByRole('button',{name:'Rotate credentials'}))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent','Administrator permission required')
    expect(screen.queryByLabelText('Backend API credential')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('queues a failed delivery retry with the actual delivery ID',async()=>{
    const detail={connection,activity:[],deliveries:[{id:'delivery',status:'failed',attempts:8,error_code:'http_503',next_attempt_at:'2026-10-04T12:00:00Z'}]}
    const manage=vi.fn(async(_org,action='list')=>action==='list'?{...overview,connections:[connection]}:detail)
    render(<ExternalWebsiteWorkspace organisationId={organisationId} manage={manage} />)
    fireEvent.click(await screen.findByRole('button',{name:/Revo Main/}))
    fireEvent.click(await screen.findByRole('button',{name:'Retry delivery'}))
    await waitFor(()=>expect(manage).toHaveBeenCalledWith(organisationId,'retry','connection',{delivery_id:'delivery'}))
  })
})
