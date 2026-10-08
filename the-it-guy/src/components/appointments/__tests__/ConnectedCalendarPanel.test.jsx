// @vitest-environment jsdom
import React from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
const api=vi.hoisted(()=>({read:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),act:vi.fn()}))
vi.mock('../../../services/calendarProviderService',()=>({readCalendarProviderStatus:api.read,startCalendarProviderConnection:api.connect,disconnectCalendarProvider:api.disconnect,actOnCalendarProviderEvent:api.act}))
import ConnectedCalendarPanel from '../ConnectedCalendarPanel'
const connection={id:'connection',provider:'google',status:'connected',accountLabel:'owner@example.test'}
const event={provider:'google',appointmentId:'booking',status:'queued',reviewToken:'review'}
const data=(changes={})=>({verified:true,connections:[connection],events:[{...event,...changes}]})
const panel=props=><ConnectedCalendarPanel organisationId="org" viewerKey="agent" appointmentId="booking" {...props} />
beforeEach(()=>{vi.resetAllMocks();api.read.mockResolvedValue(data());api.act.mockResolvedValue(data());api.disconnect.mockResolvedValue({verified:true,status:'disconnected'})})
afterEach(()=>cleanup())
it('shows persisted queued and synced states without treating a connection as a synced appointment',async()=>{
 render(panel());await screen.findByText('Waiting to sync');expect(screen.queryByText(/^Synced/)).toBeNull()
 api.read.mockResolvedValue(data({status:'synced',lastSyncedAt:'2026-10-08T19:00Z'}));fireEvent(window,new Event('online'));await screen.findByText(/^Synced · Last checked/)
})
it('keeps a failed status read visible and only reports disconnected after a verified retry',async()=>{
 api.read.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce({verified:true,connections:[],events:[]})
 render(panel());await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Connect Google'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Retry status'}));await screen.findByRole('button',{name:'Connect Google'})
})
it('requires an explicit review decision and sends the current provider and review token',async()=>{
 api.read.mockResolvedValue(data({status:'needs_review',observed:{deleted:false,title:'Outside viewing',start:'2026-10-09T09:00Z'}}))
 render(panel());await screen.findByText('Outside title: Outside viewing')
 fireEvent.click(screen.getByRole('button',{name:'Restore Arch9 copy'}));await waitFor(()=>expect(api.act).toHaveBeenCalledWith({organisationId:'org',appointmentId:'booking',provider:'google',action:'restore',reviewToken:'review'}))
})
it('can pause syncing while explaining that the Arch9 booking is unchanged',async()=>{
 api.read.mockResolvedValue(data({status:'needs_review',observed:{deleted:true}}));render(panel());await screen.findByText(/copy was deleted/)
 fireEvent.click(screen.getByRole('button',{name:'Stop syncing this copy'}));await waitFor(()=>expect(api.act.mock.calls[0][0].action).toBe('pause'))
})
it('explains retained copies before disconnecting and reports a failed disconnect',async()=>{
 api.disconnect.mockRejectedValue(new Error('Disconnect failed'));render(panel());await screen.findByText('owner@example.test')
 fireEvent.click(screen.getByRole('button',{name:'Disconnect Google'}));expect(api.disconnect).not.toHaveBeenCalled();expect(screen.getByText(/remain as manual copies/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Confirm disconnect'}));await screen.findByText(/Disconnect failed/)
})
it('never exposes an old account or late result after changing workspace',async()=>{
 let finish;api.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce({verified:true,connections:[],events:[]})
 const view=render(panel());view.rerender(panel({organisationId:'other',viewerKey:'other-agent'}));await screen.findByRole('button',{name:'Connect Google'})
 finish(data());await waitFor(()=>expect(screen.queryByText('owner@example.test')).toBeNull());expect(api.read).toHaveBeenLastCalledWith('other','booking')
})
it('shows guest restrictions and blocks repeated actions while work is pending',async()=>{
 api.read.mockResolvedValue(data({status:'needs_review',observed:{reason:'provider_has_guests'}}));let finish;api.act.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 render(panel());await screen.findByText(/outside copy has guests/)
 const restore=screen.getByRole('button',{name:'Restore Arch9 copy'});fireEvent.click(restore);fireEvent.click(restore);expect(api.act).toHaveBeenCalledTimes(1)
 finish(data());await waitFor(()=>expect(restore.disabled).toBe(false))
})
it('does not show controls without a verified viewer scope',()=>{
 render(panel({viewerKey:''}));expect(api.read).not.toHaveBeenCalled();expect(screen.queryByText('Your connected calendar')).toBeNull()
})

it('routes inconsistent saved schedules to the editor instead of claiming an outside edit',async()=>{
 api.read.mockResolvedValue(data({status:'needs_review',lastError:'schedule_needs_review'}));render(panel());await screen.findByText('Saved schedule needs review')
 expect(screen.queryByRole('button',{name:'Restore Arch9 copy'})).toBeNull();expect(screen.getByText(/saved start, end and timezone/)).toBeTruthy()
})

it('keeps a failed action visible when background status polling succeeds',async()=>{
 api.read.mockResolvedValue(data({status:'failed'}));api.act.mockRejectedValue(new Error('Retry could not be verified'))
 render(panel());await screen.findByRole('button',{name:'Retry sync'});fireEvent.click(screen.getByRole('button',{name:'Retry sync'}));await screen.findByText(/Retry could not be verified/)
 fireEvent(window,new Event('online'));await waitFor(()=>expect(api.read).toHaveBeenCalledTimes(2));expect(screen.getByText(/Retry could not be verified/)).toBeTruthy()
})
